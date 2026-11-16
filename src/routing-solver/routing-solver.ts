import {
  FirstSolutionStrategy,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  RoutingSearchStatus,
  type Assignment,
} from 'routing-wasm';
import {
  SolveVrpInput,
  SolveVrpOutput,
  SolverInputError,
  SolverInfeasibleError,
} from './routing-solver.types';

// ============================================================
// RoutingSolverService — wrapper around Google OR-Tools (routing-wasm).
//
// Esta función es PURA: no toca DB, no toca OSRM, no conoce Envio
// ni Pedido ni Camion. Toma un SolveVrpInput y devuelve un SolveVrpOutput.
//
// Internamente:
//   1. Construye un RoutingModel con un transit callback que incluye
//      tiempo de viaje + service time del nodo origen.
//   2. Usa ese callback como arc cost (objetivo: minimizar tiempo total).
//   3. Agrega dimensión de capacidad (demanda vs capacidad por vehículo).
//   4. Agrega dimensión de tiempo con el MISMO callback — así el cumulVar
//      refleja arrival time + service time acumulado.
//   5. Aplica time windows a los cumulVars.
//   6. Configura penalidades para permitir drops si es infactible.
//   7. Solve con PATH_CHEAPEST_ARC + GUIDED_LOCAL_SEARCH (default 5s).
//   8. Extrae rutas y arrivals desde la solución.
//
// API reference: https://github.com/Axelwickm/or-tools-wasm
// ============================================================

const DEFAULT_TIME_LIMIT_MS = 5_000;
const DROP_PENALTY = 10_000_000; // penalidad enorme — dropear es último recurso
const SECONDS_PER_DAY = 86_400;

/**
 * Resuelve un problema de CVRPTW.
 *
 * @throws SolverInputError si el input no valida.
 * @throws SolverInfeasibleError si OR-Tools no encuentra solución factible.
 */
export async function solve(input: SolveVrpInput): Promise<SolveVrpOutput> {
  validateInput(input);

  const numNodes = input.timeMatrix.length;
  const { numVehicles, depot } = input;

  // 1. Crear manager + routing model
  const manager = new RoutingIndexManager(numNodes, numVehicles, depot);
  const routing = new RoutingModel(manager);

  // 2. Registrar UN solo transit callback que incluya service time del origen.
  //    Esto es el patrón estándar en OR-Tools: el "tiempo de tránsito" de A→B
  //    = travel_time(A,B) + service_time(A). Así, el cumulVar en B incluye
  //    el tiempo de viaje desde A + el service time que pasaste en A.
  //
  //    IMPORTANTE: OR-Tools exige integers (internamente usa int64). OSRM
  //    devuelve durations como floats (p. ej. 1094.5 segundos). Sin el
  //    Math.round, routing-wasm llama a toInt64() que rechaza cualquier
  //    valor con parte fraccional: "integer must be a safe integer or
  //    bigint, got 1094.5".
  //
  //    Redondear a segundos enteros pierde <0.5s de precisión por arco,
  //    que es despreciable comparado con el ruido del modelo (tráfico,
  //    semáforos, etc.).
  const transitIndex = routing.registerTransitCallback((fromIdx, toIdx) => {
    const from = manager.indexToNode(fromIdx);
    const to = manager.indexToNode(toIdx);
    return Math.round(input.timeMatrix[from][to] + input.serviceTimes[from]);
  });

  // 3. El costo del arco = tiempo de viaje + service time.
  //    Minimizamos tiempo total (incluyendo descargas).
  routing.setArcCostEvaluatorOfAllVehicles(transitIndex);

  // 4. Dimensión de CAPACIDAD
  //    demandCallback devuelve la demanda del nodo — no depende del arco.
  //    addDimensionWithVehicleCapacity permite capacidades distintas por vehículo.
  const demandCallbackIndex = routing.registerUnaryTransitCallback((idx) => {
    const node = manager.indexToNode(idx);
    return Math.round(input.demands[node]);
  });

  routing.addDimensionWithVehicleCapacity(
    demandCallbackIndex,
    0,                                  // slackMax: 0 — no se puede "esperar" demanda
    input.vehicleCapacities,            // capacidades por vehículo
    true,                               // fixStartCumulToZero: arrancar en 0 carga
    'Capacity',
  );

  // 5. Dimensión de TIEMPO con el MISMO transit callback
  //    El cumulVar(index) en la dimensión Time representa el tiempo absoluto
  //    de llegada a ese nodo + service times acumulados.
  //    - slackMax = SECONDS_PER_DAY: permite esperar si llegás antes al nodo
  //      (vendedor llega a las 10:00 pero el comercio abre a las 10:30 →
  //      espera 30 min = slack).
  //    - capacity = SECONDS_PER_DAY: una ruta no puede durar más de 24h.
  //    - fixStartCumulToZero = false: queremos horarios absolutos (08:00 = 28800s),
  //      no relativos al arranque del vehículo.
  routing.addDimension(
    transitIndex,
    SECONDS_PER_DAY,
    SECONDS_PER_DAY,
    false,
    'Time',
  );

  const timeDimension = routing.getDimensionOrDie('Time');

  // 6. Time windows por nodo
  //    El cumulVar de cada nodo debe caer dentro de su [earliest, latest].
  //    Para el depósito, aplicamos la ventana a CADA start/end de vehículo
  //    para que arranquen y terminen dentro del horario operativo.
  for (let node = 0; node < numNodes; node++) {
    const [earliest, latest] = input.timeWindows[node];
    if (node === depot) {
      // Aplicar la ventana del depósito a cada vehículo (start y end)
      for (let v = 0; v < numVehicles; v++) {
        const startIdx = routing.start(v);
        const endIdx = routing.end(v);
        timeDimension.cumulVar(startIdx).setRange(BigInt(earliest), BigInt(latest));
        timeDimension.cumulVar(endIdx).setRange(BigInt(earliest), BigInt(latest));
      }
    } else {
      // Parada normal
      const idx = manager.nodeToIndex(node);
      timeDimension.cumulVar(idx).setRange(BigInt(earliest), BigInt(latest));
    }
  }

  // 7. Penalidades por drop — permite que OR-Tools omita un nodo si es
  //    infactible en vez de declarar el problema sin solución. El caller
  //    decide qué hacer con los nodos dropeados.
  for (let node = 0; node < numNodes; node++) {
    if (node === depot) continue;
    routing.addDisjunction([manager.nodeToIndex(node)], BigInt(DROP_PENALTY));
  }

  // 8. Configurar search parameters
  const timeLimitMs = input.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const timeLimitSeconds = Math.floor(timeLimitMs / 1000);
  const timeLimitNanos = (timeLimitMs % 1000) * 1_000_000;

  // 9. Solve
  const result = await routing.solve({
    executor: 'direct', // Node.js usa direct; 'worker' es para browser
    firstSolutionStrategy: FirstSolutionStrategy.PATH_CHEAPEST_ARC,
    localSearchMetaheuristic: LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH,
    timeLimit: { seconds: timeLimitSeconds, nanos: timeLimitNanos },
  });

  // 10. Mapear el status nativo a nuestro union type
  const status = mapStatus(result.status);

  // mapStatus acepta unknown porque routing-wasm exporta RoutingSearchStatus
  // como un enum/string-literal-union propio. String() funciona para ambos.

  if (!result.assignment) {
    if (status === 'INFEASIBLE' || status === 'FAIL' || status === 'FAIL_TIMEOUT') {
      throw new SolverInfeasibleError(
        `OR-Tools no encontró solución (status=${status}). ` +
          `Verificá que las ventanas de tiempo y capacidades sean consistentes.`,
      );
    }
    throw new SolverInfeasibleError(
      `OR-Tools no devolvió asignación (status=${status}).`,
    );
  }

  // 11. Extraer rutas y arrivals
  const { routes, arrivals, dropped } = extractRoutesAndArrivals(
    routing,
    manager,
    result.assignment,
    numVehicles,
    depot,
  );

  const objectiveValue = Number(result.assignment.objectiveValue());

  return {
    routes,
    arrivals,
    dropped,
    status,
    objectiveValue,
  };
}

// ============================================================
// Helpers privados
// ============================================================

function validateInput(input: SolveVrpInput): void {
  const n = input.timeMatrix.length;

  if (n === 0) {
    throw new SolverInputError('timeMatrix no puede estar vacía.');
  }

  for (let i = 0; i < n; i++) {
    if (input.timeMatrix[i].length !== n) {
      throw new SolverInputError(
        `timeMatrix debe ser cuadrada. Fila ${i} tiene ${input.timeMatrix[i].length} columnas, esperadas ${n}.`,
      );
    }
  }

  if (input.demands.length !== n) {
    throw new SolverInputError(
      `demands debe tener ${n} elementos (uno por nodo), tiene ${input.demands.length}.`,
    );
  }

  if (input.timeWindows.length !== n) {
    throw new SolverInputError(
      `timeWindows debe tener ${n} elementos, tiene ${input.timeWindows.length}.`,
    );
  }

  if (input.serviceTimes.length !== n) {
    throw new SolverInputError(
      `serviceTimes debe tener ${n} elementos, tiene ${input.serviceTimes.length}.`,
    );
  }

  if (input.vehicleCapacities.length !== input.numVehicles) {
    throw new SolverInputError(
      `vehicleCapacities debe tener ${input.numVehicles} elementos (uno por vehículo), ` +
        `tiene ${input.vehicleCapacities.length}.`,
    );
  }

  if (input.depot !== 0) {
    throw new SolverInputError(
      `depot debe ser 0 (por convención: el depósito siempre va primero en la matriz).`,
    );
  }

  if (input.numVehicles < 1) {
    throw new SolverInputError('numVehicles debe ser ≥ 1.');
  }

  for (let i = 0; i < n; i++) {
    if (input.timeMatrix[i][i] !== 0) {
      throw new SolverInputError(
        `timeMatrix[${i}][${i}] debe ser 0 (tiempo de i a i es 0), es ${input.timeMatrix[i][i]}.`,
      );
    }
  }

  if (input.demands[0] !== 0) {
    throw new SolverInputError(
      `demands[0] (depósito) debe ser 0, es ${input.demands[0]}.`,
    );
  }

  for (let i = 0; i < n; i++) {
    const [earliest, latest] = input.timeWindows[i];
    if (earliest < 0 || latest < 0 || earliest > latest) {
      throw new SolverInputError(
        `timeWindows[${i}] inválido: [${earliest}, ${latest}]. earliest debe ser ≥ 0 y ≤ latest.`,
      );
    }
  }
}

function mapStatus(nativeStatus: unknown): SolveVrpOutput['status'] {
  // routing-wasm exporta RoutingSearchStatus como un enum/string-literal
  // union propio. Cubrimos todos los casos posibles: enum values, string
  // literals y numeric fallbacks — funciona sin importar cómo lo exporte
  // la versión específica de routing-wasm instalada.
  switch (nativeStatus) {
    case RoutingSearchStatus.ROUTING_SUCCESS:
    case 'ROUTING_SUCCESS':
    case 'SUCCESS':
    case 1:
      return 'SUCCESS';
    case RoutingSearchStatus.ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED:
    case 'ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED':
    case 'PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED':
    case 2:
      return 'PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED';
    case RoutingSearchStatus.ROUTING_FAIL_TIMEOUT:
    case 'ROUTING_FAIL_TIMEOUT':
    case 'FAIL_TIMEOUT':
    case 3:
      return 'FAIL_TIMEOUT';
    case RoutingSearchStatus.ROUTING_INFEASIBLE:
    case 'ROUTING_INFEASIBLE':
    case 'INFEASIBLE':
    case 4:
      return 'INFEASIBLE';
    case RoutingSearchStatus.ROUTING_FAIL:
    case 'ROUTING_FAIL':
    case 'FAIL':
    case 0:
      return 'FAIL';
    case RoutingSearchStatus.ROUTING_NOT_SOLVED:
    case 'ROUTING_NOT_SOLVED':
    case 'NOT_SOLVED':
    default:
      return 'ROUTING_NOT_SOLVED';
  }
}

/**
 * Camina la cadena nextVar del assignment para extraer la ruta de cada
 * vehículo, y lee los cumulVars de la dimensión Time para los arrival times.
 *
 * IMPORTANTE sobre los arrival times devueltos:
 *   El cumulVar de la dimensión Time incluye el service time acumulado del
 *   nodo anterior (porque el transit callback suma serviceTimes[from]).
 *   Por lo tanto, arrivals[v][k] representa "cuándo llegó el vehículo v al
 *   nodo routes[v][k], contando desde medianoche, incluyendo el service
 *   time del nodo ANTERIOR pero NO el de este nodo".
 *
 *   Ejemplo: ruta [0, 3, 0], arrivals [28800, 29400, 30000]
 *     - Salida del depósito a las 08:00:00 (28800s)
 *     - Llegada a parada 3 a las 08:10:00 (29400s) — incluye el travel time
 *       del depósito a 3 (300s = 5min) + service time del depósito (0s).
 *       Pero NO incluye el service time de 3 todavía.
 *     - Llegada al depósito a las 08:20:00 (30000s) — incluye el travel time
 *       3→0 + el service time de 3 (10 min).
 *
 *   PlanRutaService debería usar arrivals[v][k] para Pedido.llegadaEstimada
 *   cuando routes[v][k] es una parada real (no el depósito).
 */
function extractRoutesAndArrivals(
  routing: RoutingModel,
  manager: RoutingIndexManager,
  assignment: Assignment,
  numVehicles: number,
  depot: number,
): { routes: number[][]; arrivals: number[][]; dropped: number[] } {
  const routes: number[][] = [];
  const arrivals: number[][] = [];
  const visitedNodes = new Set<number>();

  const timeDimension = routing.getDimensionOrDie('Time');

  for (let v = 0; v < numVehicles; v++) {
    const route: number[] = [];
    const times: number[] = [];

    let index = routing.start(v);

    // Si el vehículo arranca y termina en el depósito sin paradas (ruta vacía),
    // nextVar(start) apunta directamente al end. En ese caso, sólo agregamos
    // el depósito inicial y el final.
    while (!routing.isEnd(index)) {
      const node = manager.indexToNode(index);
      route.push(node);
      visitedNodes.add(node);

      const cumulVar = timeDimension.cumulVar(index);
      const arrivalTime = Number(assignment.value(cumulVar));
      times.push(arrivalTime);

      const nextVar = routing.nextVar(index);
      index = assignment.value(nextVar);
    }

    // Agregar el end (depósito final)
    const endIdx = routing.end(v);
    const endNode = manager.indexToNode(endIdx);
    route.push(endNode);
    visitedNodes.add(endNode);

    const endCumulVar = timeDimension.cumulVar(endIdx);
    const endArrivalTime = Number(assignment.value(endCumulVar));
    times.push(endArrivalTime);

    routes.push(route);
    arrivals.push(times);
  }

  // Nodos dropeados: todos los que NO son el depósito y no fueron visitados
  const numNodes = manager.numLocations;
  const dropped: number[] = [];
  for (let node = 0; node < numNodes; node++) {
    if (node === depot) continue;
    if (!visitedNodes.has(node)) {
      dropped.push(node);
    }
  }

  return { routes, arrivals, dropped };
}
