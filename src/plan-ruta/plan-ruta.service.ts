import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OsrmService } from '../osrm/osrm.service';
import { DepositoService } from '../deposito/deposito.service';
import { RoutingSolverService } from '../routing-solver/routing-solver.service';
import { CreatePlanRutaDto } from './dto/create-plan-ruta.dto';
import { OptimizePlanRutaDto } from './dto/optimize-plan-ruta.dto';
import {
  OptimizerPreparedInput,
  OptimizeResult,
  Parada,
  PedidoNoAsignable,
} from './plan-ruta.types';

// ============================================================
// PlanRutaService — el orquestador que une todo.
//
// Métodos públicos:
//   - create(dto)               crea un PlanRuta (sin optimizar todavía)
//   - findOne(id)               devuelve un PlanRuta con envios + pedidos + rutaOptima
//   - findAll()                 lista todos los PlanRutas
//   - updateEstado(id, estado)  cambia el estado (PENDIENTE/OPTIMIZADO/EN_PROCESO/FINALIZADO/FALLIDO)
//   - remove(id)                soft-delete (no implementado todavía — los PlanRutas son inmutables por ahora)
//   - optimize(id, dto?)        EL MÉTODO PRINCIPAL — orquesta OsrmService + solve() + persistencia
//
// Flujo de optimize():
//   1. Cargar PlanRuta + Pedidos listos para rutear + Camiones disponibles + Deposito
//   2. Dedup comercios (multi-pedido a mismo comercio = una sola parada)
//   3. Build coord array: [deposito, ...paradas únicas]
//   4. osrmService.table(coords) → timeMatrix
//   5. Build demands / timeWindows / serviceTimes / vehicleCapacities
//   6. solve(input) → routes + arrivals + dropped
//   7. Por cada vehículo:
//        - osrmService.route(orderedCoords) → geometry + distance + duration
//   8. Prisma transaction:
//        - Crear Envio por vehículo con rutaOptima + distanciaMetros + duracionSegundos
//        - Update Pedido: envioId, ordenRuta, llegadaEstimada
//        - Update PlanRuta: estado = 'OPTIMIZADO'
//   9. Si dropped.length > 0 → log + retornar info (no fallar)
// ============================================================

const PLAN_RUTA_SELECT = {
  id: true,
  fecha: true,
  depositoId: true,
  horaLimite: true,
  estado: true,
  createdAt: true,
  updatedAt: true,
  deposito: true,
  envios: {
    include: {
      camion: true,
      pedidos: {
        select: {
          id: true,
          ordenRuta: true,
          llegadaEstimada: true,
          pesoGramos: true,
          comercio: { select: { id: true, nombre: true, direccion: true, latitud: true, longitud: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class PlanRutaService {
  private readonly logger = new Logger(PlanRutaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly osrm: OsrmService,
    private readonly depositoService: DepositoService,
    private readonly solver: RoutingSolverService,
  ) {}

  // ============================================================
  // CRUD
  // ============================================================

  async create(dto: CreatePlanRutaDto) {
    // Validar que el depósito exista y esté activo
    const deposito = await this.depositoService.findOne(dto.depositoId);
    if (!deposito.activo) {
      throw new BadRequestException(
        'El depósito seleccionado no está activo. Elegí otro.',
      );
    }

    // Validar camionIds si vienen en el DTO
    if (dto.camionIds && dto.camionIds.length > 0) {
      const camiones = await this.prisma.camion.findMany({
        where: { id: { in: dto.camionIds }, deletedAt: null },
      });
      if (camiones.length !== new Set(dto.camionIds).size) {
        throw new BadRequestException(
          'Alguno de los camiones indicados no existe o está dado de baja.',
        );
      }
    }

    const fechaDate = new Date(dto.fecha);
    const horaLimiteDate = new Date(dto.horaLimite);

    if (horaLimiteDate <= fechaDate) {
      throw new BadRequestException(
        'horaLimite debe ser posterior a fecha (el deadline no puede ser antes del día de ruteo).',
      );
    }

    return this.prisma.planRuta.create({
      data: {
        fecha: fechaDate,
        depositoId: dto.depositoId,
        horaLimite: horaLimiteDate,
        estado: 'PENDIENTE',
      },
      include: { deposito: true },
    });
  }

  findAll() {
    return this.prisma.planRuta.findMany({
      select: PLAN_RUTA_SELECT,
      orderBy: [{ fecha: 'desc' }],
    });
  }

  async findOne(id: number) {
    const plan = await this.prisma.planRuta.findUnique({
      where: { id },
      select: PLAN_RUTA_SELECT,
    });
    if (!plan) {
      throw new NotFoundException('PlanRuta no encontrado');
    }
    return plan;
  }

  async updateEstado(id: number, estado: string) {
    await this.findOne(id);
    const estadosValidos = ['PENDIENTE', 'OPTIMIZADO', 'EN_PROCESO', 'FINALIZADO', 'FALLIDO'];
    if (!estadosValidos.includes(estado)) {
      throw new BadRequestException(
        `Estado inválido: "${estado}". Válidos: ${estadosValidos.join(', ')}`,
      );
    }
    return this.prisma.planRuta.update({
      where: { id },
      data: { estado },
      select: PLAN_RUTA_SELECT,
    });
  }

  // ============================================================
  // OPTIMIZE — el corazón del módulo
  // ============================================================

  async optimize(planRutaId: number, dto?: OptimizePlanRutaDto): Promise<OptimizeResult> {
    // 1. Cargar el PlanRuta + depósito
    const plan = await this.findOne(planRutaId);

    if (plan.estado === 'OPTIMIZADO') {
      throw new BadRequestException(
        'El PlanRuta ya está optimizado. Si querés re-optimizar, primero pasá su estado a PENDIENTE.',
      );
    }
    if (plan.estado === 'EN_PROCESO') {
      throw new BadRequestException(
        'El PlanRuta ya está siendo optimizado por otro proceso.',
      );
    }

    // Marcar como EN_PROCESO para evitar reentrancia
    await this.prisma.planRuta.update({
      where: { id: planRutaId },
      data: { estado: 'EN_PROCESO' },
    });

    try {
      // 2. Cargar pedidos listos para rutear
      // Criterio: pedidos que estén en estado 'pendiente_preparacion' 
      // (no listos para salir, antes de que se hayan preparado)
      // y que NO tengan envioId asignado todavía.

      const pedidos = await this.loadPedidosForOptimization(planRutaId);

      if (pedidos.length === 0) {
        throw new BadRequestException(
          'No hay pedidos listos para rutear en este PlanRuta. ' +
            'Los pedidos deben estar en estado "Pendiente de preparación" y sin envío asignado.',
        );
      }

      // 3. Cargar camiones disponibles
      const camiones = await this.loadCamionesForOptimization(plan);
      if (camiones.length === 0) {
        throw new BadRequestException(
          'No hay camiones disponibles para el día del PlanRuta.',
        );
      }

      // 4. El depósito ya viene incluido en `plan` gracias a PLAN_RUTA_SELECT
      //    (findOne devuelve plan.deposito). No hace falta re-fetchearlo.
      const deposito = plan.deposito;

      // 5. Dedup comercios + consolidar demandas
      const paradas = this.consolidarParadas(pedidos);
      if (paradas.length === 0) {
        throw new BadRequestException(
          'No se pudieron consolidar paradas a partir de los pedidos.',
        );
      }

      // 6. Preparar input para el solver (coords, demands, timeWindows, etc.)
      //    y traer la matriz de tiempos desde OSRM.
      const prepared = await this.prepareOptimizerInput(
        deposito,
        paradas,
        camiones,
        plan,
      );

      // 7. Solve
      const solveResult = await this.solver.solve({
        timeMatrix: prepared.timeMatrix,
        demands: prepared.demands,
        vehicleCapacities: prepared.vehicleCapacities,
        timeWindows: prepared.timeWindows,
        serviceTimes: prepared.serviceTimes,
        numVehicles: prepared.camiones.length,
        depot: 0,
        timeLimitMs: dto?.timeLimitMs ?? 10_000,
      });

      this.logger.log(
        `PlanRuta #${planRutaId} — solver status: ${solveResult.status}, ` +
          `objective: ${solveResult.objectiveValue}, ` +
          `routes: ${solveResult.routes.length}, ` +
          `dropped: ${solveResult.dropped.length}`,
      );

      // 8. Por cada vehículo, obtener la geometría desde OSRM
      //    y construir los datos para persistir.
      const enviosData = await this.fetchRouteGeometries(
        solveResult.routes,
        prepared,
      );

      // 9. Mapear nodos dropeados a pedidos no asignables
      const noAsignables = this.mapDroppedToPedidos(
        solveResult.dropped,
        prepared.paradas,
      );

      // 10. Persistir todo en una transacción
      const persisted = await this.persistOptimization(
        planRutaId,
        plan.fecha,
        enviosData,
        solveResult,
        prepared,
        noAsignables,
      );

      // 11. Marcar PlanRuta como OPTIMIZADO
      await this.prisma.planRuta.update({
        where: { id: planRutaId },
        data: { estado: 'OPTIMIZADO' },
      });

      return {
        planRutaId,
        enviosCreados: persisted.enviosCreados,
        pedidosAsignados: persisted.pedidosAsignados,
        pedidosNoAsignables: noAsignables,
        distanciaTotalMetros: persisted.distanciaTotalMetros,
        duracionTotalSegundos: persisted.duracionTotalSegundos,
        objectiveValue: solveResult.objectiveValue,
        solverStatus: solveResult.status,
      };
    } catch (err) {
      // Revertir estado a FALLIDO si fue un error nuestro (no de validación)
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        // Validación → volver a PENDIENTE
        await this.prisma.planRuta.update({
          where: { id: planRutaId },
          data: { estado: 'PENDIENTE' },
        });
      } else {
        // Error real (OSRM caído, solver infactible, etc.) → FALLIDO
        this.logger.error(
          `Optimización de PlanRuta #${planRutaId} falló: ${(err as Error).message}`,
        );
        await this.prisma.planRuta.update({
          where: { id: planRutaId },
          data: { estado: 'FALLIDO' },
        });
      }
      throw err;
    }
  }



  private async loadPedidosForOptimization(planRutaId: number) {
    const estadoPendientePreparacion = await this.prisma.estado.findUnique({
      where: { nombre: 'pendiente_preparacion' },
    });
    if (!estadoPendientePreparacion) {
      throw new BadRequestException(
        'No existe el estado "pendiente_preparacion" en la base de datos. ' +
          'Corré el seed para inicializar los estados.',
      );
    }

    return this.prisma.pedido.findMany({
      where: {
        envioId: null,
        historialEstados: {
          some: {
            estadoId: estadoPendientePreparacion.id,
            fechaFin: null, // estado actual
          },
        },
      },
      include: {
        comercio: true,
      },
    });
  }

  /**
   * Carga los camiones disponibles para el día del PlanRuta.
   * - disponible = true
   * - no soft-deleted (deletedAt null)
   * - no asignados a otro Envio del mismo día
   *
   * Si el PlanRuta fue creado con camionIds explícitos, respeta esa lista.
   */
  private async loadCamionesForOptimization(plan: { fecha: Date; depositoId: number }) {
    // Buscar si el PlanRuta fue creado con camionIds explícitos
    // (no está en el schema todavía — este es el camino default)
    const fechaDia = plan.fecha;
    const inicioDelDia = new Date(fechaDia);
    inicioDelDia.setUTCHours(0, 0, 0, 0);
    const finDelDia = new Date(fechaDia);
    finDelDia.setUTCHours(23, 59, 59, 999);

    // Camiones ya asignados a otros Envios ese día
    const camionesOcupados = await this.prisma.envio.findMany({
      where: {
        fechaEntrega: { gte: inicioDelDia, lte: finDelDia },
      },
      select: { camionId: true },
    });
    const ocupadosIds = camionesOcupados.map((e) => e.camionId);

    return this.prisma.camion.findMany({
      where: {
        disponible: true,
        deletedAt: null,
        id: { notIn: ocupadosIds },
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Agrupa los pedidos por comercio para que cada comercio sea una sola parada
   * (no múltiples paradas si hay múltiples pedidos al mismo comercio).
   *
   * También suma el pesoGramos total por comercio (demanda).
   */
  private consolidarParadas(
    pedidos: Array<{
      id: number;
      pesoGramos: number;
      comercio: {
        id: number;
        latitud: number;
        longitud: number;
        tiempoServicioMin: number;
        horaAbreMat: string;
        horaCierreMat: string;
        horaAbreVesp: string;
        horaCierreVesp: string;
      };
    }>,
  ): Parada[] {
    const porComercio = new Map<number, Parada>();

    for (const pedido of pedidos) {
      const c = pedido.comercio;
      let parada = porComercio.get(c.id);
      if (!parada) {
        parada = {
          comercio: {
            id: c.id,
            latitud: c.latitud,
            longitud: c.longitud,
            tiempoServicioMin: c.tiempoServicioMin,
            horaAbreMat: c.horaAbreMat,
            horaCierreMat: c.horaCierreMat,
            horaAbreVesp: c.horaAbreVesp,
            horaCierreVesp: c.horaCierreVesp,
          },
          pedidos: [],
        };
        porComercio.set(c.id, parada);
      }
      parada.pedidos.push({ id: pedido.id, pesoGramos: pedido.pesoGramos });
    }

    return Array.from(porComercio.values());
  }

  /**
   * Construye el OptimizerPreparedInput a partir de los datos del dominio.
   * Trae la matriz de tiempos desde OSRM y la convierte al formato del solver.
   */
  private async prepareOptimizerInput(
    deposito: { latitud: number; longitud: number; horaApertura: string; horaCierre: string },
    paradas: Parada[],
    camiones: Array<{ id: number; capacidad: number; capacidadVolumen: number | null }>,
    plan: { fecha: Date; horaLimite: Date },
  ): Promise<OptimizerPreparedInput> {
    // Coords: [deposito, ...paradas] — el depósito SIEMPRE va primero (índice 0).
    // Anotación explícita del return type del map callback porque TypeScript
    // no propaga el contextual type `[number, number][]` a través del spread.
    // Sin la anotación, `[lon, lat]` se infiere como `number[]` (mutable,
    // podría tener 0 o 1 elementos) y el spread falla el check de tupla.
    const coords: [number, number][] = [
      [deposito.longitud, deposito.latitud],
      ...paradas.map((p): [number, number] => [p.comercio.longitud, p.comercio.latitud]),
    ];

    // 1. Matriz de tiempos desde OSRM
    const { durations } = await this.osrm.table(coords);

    // 2. Demanda por nodo (depósito = 0, parada = suma de pesoGramos)
    const demands: number[] = [
      0,
      ...paradas.map((p) => p.pedidos.reduce((sum, ped) => sum + ped.pesoGramos, 0)),
    ];

    // 3. Time windows por nodo en segundos desde medianoche
    //    Depósito: [horaApertura, horaCierre] del depósito → segundos
    //    Parada: [horaAperturaVesp, horaCierreVesp] del comercio
    //    Para simplificar, usamos la ventana VESPERTINA completa del comercio.
    //    En el futuro se puede modelar la franja matutina + vespertina como
    //    dos ventanas disjuntas (requiere custom constraint en OR-Tools).
    const inicioDelDia = new Date(plan.fecha);
    inicioDelDia.setUTCHours(0, 0, 0, 0);
    const horaLimiteSegundos = Math.floor(
      (plan.horaLimite.getTime() - inicioDelDia.getTime()) / 1000,
    );

    const timeWindows: [number, number][] = [
      // Depósito: abre a las horaApertura y cierra a la horaLimite del PlanRuta
      [hhmmToSeconds(deposito.horaApertura), horaLimiteSegundos],
      // Paradas: ventana del comercio (matutina + vespertina combinada)
      ...paradas.map((p) => {
        const abre = hhmmToSeconds(p.comercio.horaAbreMat);
        const cierra = hhmmToSeconds(p.comercio.horaCierreVesp);
        return [abre, cierra] as [number, number];
      }),
    ];

    // 4. Service times por nodo (depósito = 0, parada = tiempoServicioMin × 60)
    const serviceTimes: number[] = [
      0,
      ...paradas.map((p) => p.comercio.tiempoServicioMin * 60),
    ];

    // 5. Capacidades: convertir kg → gramos para que las unidades coincidan
    //    con pedido.pesoGramos.
    const vehicleCapacities: number[] = camiones.map((c) => c.capacidad * 1000);

    return {
      coords,
      timeMatrix: durations,
      demands,
      timeWindows,
      serviceTimes,
      vehicleCapacities,
      camiones: camiones as never, // type cast: el solver no necesita los campos extras
      paradas,
      deposito: deposito as never,
    };
  }

  /**
   * Para cada ruta devuelta por el solver, llama a /route de OSRM para
   * obtener la geometría GeoJSON + distancia + duración.
   */
  private async fetchRouteGeometries(
    routes: number[][],
    prepared: OptimizerPreparedInput,
  ): Promise<
    Array<{
      vehicleIndex: number;
      camionId: number;
      geometry: { type: 'LineString'; coordinates: [number, number][] };
      distance: number;
      duration: number;
      stops: Array<{ nodeIndex: number; arrivalSeconds: number; pedidoIds: number[]; comercioId: number }>;
    }>
  > {
    const result = [];

    for (let v = 0; v < routes.length; v++) {
      const route = routes[v];

      // Ruta vacía: [0, 0] — vehículo no asignado a nada
      if (route.length <= 2) {
        continue;
      }

      // Para /route necesitamos las coords en el orden del route
      const orderedCoords: [number, number][] = route.map(
        (nodeIdx) => prepared.coords[nodeIdx],
      );

      const routeResult = await this.osrm.route(orderedCoords);

      // Construir info de cada parada (no del depósito)
      const stops = [];
      for (let k = 1; k < route.length - 1; k++) {
        const nodeIndex = route[k];
        if (nodeIndex === 0) continue; // skip depot
        const parada = prepared.paradas[nodeIndex - 1];
        stops.push({
          nodeIndex,
          arrivalSeconds: 0, // se setea en persistOptimization cuando leemos arrivals
          pedidoIds: parada.pedidos.map((p) => p.id),
          comercioId: parada.comercio.id,
        });
      }

      result.push({
        vehicleIndex: v,
        camionId: prepared.camiones[v].id,
        geometry: routeResult.geometry,
        distance: routeResult.distance,
        duration: routeResult.duration,
        stops,
      });
    }

    return result;
  }

  /**
   * Mapea los nodeIndex dropeados a pedidos no asignables.
   */
  private mapDroppedToPedidos(
    dropped: number[],
    paradas: Parada[],
  ): PedidoNoAsignable[] {
    const result: PedidoNoAsignable[] = [];
    for (const nodeIndex of dropped) {
      if (nodeIndex === 0) continue; // depot nunca se dropea
      const parada = paradas[nodeIndex - 1];
      for (const pedido of parada.pedidos) {
        result.push({
          pedidoId: pedido.id,
          comercioId: parada.comercio.id,
          motivo: 'El solver no pudo asignar esta parada a ningún vehículo (capacidad o ventana de tiempo excedida).',
        });
      }
    }
    return result;
  }

  /**
   * Persiste todo en una transacción: crea un Envio por vehículo,
   * asigna pedidos al Envio con su ordenRuta + llegadaEstimada,
   * y setea Envio.rutaOptima + distanciaMetros + duracionSegundos.
   *
   * `planFecha` es el día del PlanRuta — se usa para:
   *   - envio.fechaEntrega (sin hora específica, la ruta se ejecuta durante el día)
   *   - pedido.llegadaEstimada (inicio del día + arrivalSeconds del solver)
   */
  private async persistOptimization(
    planRutaId: number,
    planFecha: Date,
    enviosData: Array<{
      vehicleIndex: number;
      camionId: number;
      geometry: { type: 'LineString'; coordinates: [number, number][] };
      distance: number;
      duration: number;
      stops: Array<{ nodeIndex: number; arrivalSeconds: number; pedidoIds: number[]; comercioId: number }>;
    }>,
    solveResult: { routes: number[][]; arrivals: number[][] },
    prepared: OptimizerPreparedInput,
    _noAsignables: PedidoNoAsignable[],
  ): Promise<{ enviosCreados: number; pedidosAsignados: number; distanciaTotalMetros: number; duracionTotalSegundos: number }> {
    const inicioDiaPlan = new Date(planFecha);
    // Usamos setUTCHours en vez de setHours para no depender del timezone
    // del container (que puede ser UTC o America/Argentina/Buenos_Aires).
    // Los arrival times del solver son "segundos desde medianoche UTC" del
    // día del PlanRuta, así que queremos medianoche UTC como base.
    inicioDiaPlan.setUTCHours(0, 0, 0, 0);

    return this.prisma.$transaction(async (tx) => {
      let enviosCreados = 0;
      let pedidosAsignados = 0;
      let distanciaTotal = 0;
      let duracionTotal = 0;

      for (const envioData of enviosData) {
        const envio = await tx.envio.create({
          data: {
            planRutaId,
            camionId: envioData.camionId,
            fechaEntrega: inicioDiaPlan,
            rutaOptima: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: envioData.geometry,
                  properties: {
                    vehicle: envioData.vehicleIndex,
                    distance: envioData.distance,
                    duration: envioData.duration,
                  },
                },
              ],
            },
            distanciaMetros: envioData.distance,
            duracionSegundos: Math.round(envioData.duration),
            optimizadoAt: new Date(),
          },
        });

        distanciaTotal += envioData.distance;
        duracionTotal += envioData.duration;
        enviosCreados++;

        // Asignar cada parada al Envio
        const route = solveResult.routes[envioData.vehicleIndex];
        const arrivals = solveResult.arrivals[envioData.vehicleIndex];

        for (let k = 1; k < route.length - 1; k++) {
          const nodeIndex = route[k];
          if (nodeIndex === 0) continue;
          const arrivalSeconds = arrivals[k];

          const llegadaEstimada = new Date(
            inicioDiaPlan.getTime() + arrivalSeconds * 1000,
          );

          const parada = prepared.paradas[nodeIndex - 1];
          for (const pedido of parada.pedidos) {
            await tx.pedido.update({
              where: { id: pedido.id },
              data: {
                envioId: envio.id,
                ordenRuta: k,
                llegadaEstimada,
              },
            });
            pedidosAsignados++;
          }
        }
      }

      return {
        enviosCreados,
        pedidosAsignados,
        distanciaTotalMetros: distanciaTotal,
        duracionTotalSegundos: Math.round(duracionTotal),
      };
    });
  }
}

// ============================================================
// Utilidades privadas del módulo
// ============================================================

/** Convierte un string "HH:MM" a segundos desde medianoche. */
function hhmmToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
  return h * 3600 + m * 60;
}
