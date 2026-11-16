// ============================================================
// Tipos del solver de ruteo (CVRPTW).
//
// Estos tipos son la API pública del módulo routing-solver.
// El resto del dominio (PlanRutaService en Batch 4) construye
// un SolveVrpInput y consume el SolveVrpOutput — no necesita
// saber nada sobre or-tools-wasm.
// ============================================================

/**
 * Input del solver: un problema de ruteo capacitado con ventanas
 * de tiempo (CVRPTW).
 *
 * Todos los tiempos están en SEGUNDOS.
 * Todas las demandas y capacidades están en una unidad consistente
 * (decidida por el caller — grammos, kg, unidades, lo que sea).
 */
export interface SolveVrpInput {
  /**
   * Matriz N×N de tiempos de viaje en SEGUNDOS.
   * timeMatrix[i][j] = tiempo de viaje desde el nodo i hasta el nodo j.
   * ASIMÉTRICA: timeMatrix[i][j] ≠ timeMatrix[j][i] por calles de sentido único.
   * Índice 0 = depósito. Índices 1..N-1 = puntos de entrega.
   * (Es lo que OsrmService.table(coords).durations devuelve.)
   */
  timeMatrix: number[][];

  /**
   * Demanda en cada nodo. Mismo largo que timeMatrix.
   * demands[0] = 0 (el depósito no demanda nada).
   * demands[i] = suma de pesoGramos de los Pedidos que van al comercio i.
   */
  demands: number[];

  /**
   * Capacidad máxima de cada vehículo. Mismo largo que numVehicles.
   * Ej: [1200000, 1500000, 1000000] para 3 camiones con capacidades
   * en gramos (1.2t, 1.5t, 1t).
   */
  vehicleCapacities: number[];

  /**
   * Ventana de tiempo por nodo, en SEGUNDOS desde medianoche (00:00:00).
   * timeWindows[i] = [earliest, latest] — llegada permitida entre esos dos.
   * timeWindows[0] = ventana del depósito (horario de operación del día).
   *
   * Para una Parada i con Comercio.horaAbreMat="08:00" y horaCierreVesp="18:00"
   * en el día de PlanRuta.fecha: timeWindows[i] = [28800, 64800].
   */
  timeWindows: [number, number][];

  /**
   * Tiempo de servicio (descarga + firma) en cada nodo, en SEGUNDOS.
   * serviceTimes[0] = 0 (no hay descarga en el depósito).
   * serviceTimes[i] = Comercio.tiempoServicioMin * 60.
   */
  serviceTimes: number[];

  /**
   * Cantidad de vehículos disponibles para este PlanRuta.
   * = count de Camion donde disponible=true y no están ya asignados
   *   a otro Envio del mismo día.
   */
  numVehicles: number;

  /**
   * Índice del depósito en timeMatrix. Siempre 0 en nuestro setup
   * (BuildCoordsArray siempre pone el depósito primero).
   */
  depot: 0;

  /**
   * Tiempo máximo que el solver puede pasar buscando, en milisegundos.
   * Default: 5000ms. Para problemas grandes (>50 paradas) conviene 10000-30000.
   */
  timeLimitMs?: number;
}

/**
 * Output del solver: rutas y horarios calculados.
 */
export interface SolveVrpOutput {
  /**
   * Para cada vehículo v (0..numVehicles-1), una lista ORDENADA de índices de
   * nodos que visita.
   *
   * Ejemplo: routes[0] = [0, 3, 7, 5, 0] significa que el vehículo 0 sale del
   * depósito (0), visita las paradas 3, 7 y 5 en ese orden, y vuelve al depósito.
   *
   * Vehículos sin asignación: routes[v] = [0, 0] (depósito a depósito, vacío).
   */
  routes: number[][];

  /**
   * Para cada vehículo v, el tiempo acumulado de llegada a cada nodo en routes[v].
   *
   * arrivals[v][k] = tiempo (segundos desde medianoche) en que el vehículo v
   * llega al nodo routes[v][k].
   *
   * Ejemplo: si routes[0] = [0, 3, 7, 5, 0] y arrivals[0] = [28800, 29400, 30600,
   * 31500, 32400], el vehículo 0 sale del depósito a las 08:00 (28800s), llega a
   * la parada 3 a las 08:10, etc.
   *
   * PlanRutaService va a convertir estos segundos a Date objects para
   * Pedido.llegadaEstimada.
   */
  arrivals: number[][];

  /**
   * Índices de nodos que el solver NO pudo asignar a ningún vehículo
   * (capacidad excedida o ventana de tiempo imposible).
   *
   * En un PlanRuta bien formado esto debería ser []. Si no lo es, el caller
   * debe marcar esos pedidos como "no entregable" y notificar al usuario.
   */
  dropped: number[];

  /**
   * Status de la solución reportado por OR-Tools.
   * - SUCCESS: encontró una solución óptima o subóptima factible
   * - PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED: encontró solución pero no óptima
   * - FAIL_TIMEOUT: no encontró solución en timeLimitMs
   * - INFEASIBLE: el problema no tiene solución (constraints contradictorias)
   * - FAIL: error genérico
   */
  status:
    | 'SUCCESS'
    | 'PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED'
    | 'FAIL_TIMEOUT'
    | 'INFEASIBLE'
    | 'FAIL'
    | 'ROUTING_NOT_SOLVED';

  /**
   * Valor objetivo (costo total de todas las rutas). En nuestro setup,
   * es la suma de tiempos de viaje. Útil para comparar optimizaciones
   * sucesivas — si una segunda optimización da un valor menor, mejoró.
   */
  objectiveValue: number;
}

/**
 * Error lanzado cuando el input no valida.
 */
export class SolverInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolverInputError';
  }
}

/**
 * Error lanzado cuando el solver no encuentra solución.
 */
export class SolverInfeasibleError extends Error {
  readonly dropped: number[];

  constructor(message: string, dropped: number[] = []) {
    super(message);
    this.name = 'SolverInfeasibleError';
    this.dropped = dropped;
  }
}
