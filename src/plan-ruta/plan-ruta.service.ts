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
import { SolverInfeasibleError, SolverInputError } from '../routing-solver/routing-solver.types';
import { PedidoService } from '../pedido/pedido.service';
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
  camiones: true,
  envios: {
    include: {
      camion: true,
      empleados: { select: { id: true, nombre: true, apellido: true } },
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
    private readonly pedidoService: PedidoService,
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

    // El usuario de ruteo ingresa los vehículos disponibles: es obligatorio elegir al menos uno.
    const camionIds = [...new Set(dto.camionIds ?? [])];
    if (camionIds.length === 0) {
      throw new BadRequestException('Elegí al menos un camión disponible para armar la hoja de ruta.');
    }
    const camiones = await this.prisma.camion.findMany({
      where: { id: { in: camionIds }, deletedAt: null, disponible: true },
      select: { id: true },
    });
    if (camiones.length !== camionIds.length) {
      throw new BadRequestException(
        'Alguno de los camiones elegidos no existe, está dado de baja o está fuera de servicio.',
      );
    }

    const fechaDate = new Date(dto.fecha);
    const horaLimiteDate = new Date(dto.horaLimite);

    validarFechaDelPlan(fechaDate);

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
        camiones: { connect: camionIds.map((id) => ({ id })) },
      },
      include: { deposito: true, camiones: true },
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
    const actual = await this.findOne(id);
    if (actual.estado === 'DESPACHADO' || actual.estado === 'FINALIZADO') {
      throw new BadRequestException('El plan ya salió a reparto: no se puede modificar su estado.');
    }
    const estadosValidos = ['PENDIENTE', 'OPTIMIZADO', 'EN_PROCESO', 'DESPACHADO', 'FINALIZADO', 'FALLIDO'];
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

    if (plan.estado === 'DESPACHADO' || plan.estado === 'FINALIZADO') {
      throw new BadRequestException('El plan ya salió a reparto: no se puede volver a optimizar.');
    }
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

    // Consigna: la hoja de ruta es del día siguiente y se genera a partir del horario de corte.
    validarFechaDelPlan(plan.fecha);
    validarHorarioDeCorte();

    // Marcar como EN_PROCESO de forma ATÓMICA: si dos requests llegan a la vez, solo una gana el lock.
    const lock = await this.prisma.planRuta.updateMany({
      where: { id: planRutaId, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
      data: { estado: 'EN_PROCESO' },
    });
    if (lock.count === 0) {
      throw new BadRequestException(
        'El PlanRuta ya está siendo optimizado o no está en un estado que permita optimizar.',
      );
    }

    try {
      // Si venía de una optimización anterior (re-optimizar), liberar sus envíos y pedidos.
      await this.liberarRutasPrevias(planRutaId);

      // 2. Cargar pedidos listos para rutear
      // Criterio (según la consigna): pedidos aprobados y ARMADOS por el depósito,
      // es decir en estado 'preparado', y que NO tengan envioId asignado todavía.

      const pedidos = await this.loadPedidosForOptimization(planRutaId);

      if (pedidos.length === 0) {
        throw new BadRequestException(
          'No hay pedidos listos para rutear en este PlanRuta. ' +
            'Los pedidos deben estar aprobados y armados (estado "Preparado") y sin envío asignado.',
        );
      }

      // 3. Cargar camiones disponibles
      const camiones = await this.loadCamionesForOptimization(plan);
      if (camiones.length === 0) {
        throw new BadRequestException(
          'Ninguno de los camiones elegidos está disponible ese día (fuera de servicio, dado de baja o asignado a otro plan).',
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

      if (!solveResult.routes.some((r) => r.length > 2)) {
        throw new BadRequestException(
          `El optimizador no pudo asignar ningún pedido a un camión (estado: ${solveResult.status}). ` +
            'Revisá la capacidad de los camiones elegidos, el peso de los pedidos y los horarios de los comercios.',
        );
      }

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
      // El solver no encontró solución (capacidad / ventanas imposibles): es un problema de los datos
      // de entrada, no una falla del sistema. El plan vuelve a PENDIENTE para corregirlos y reintentar.
      if (err instanceof SolverInfeasibleError || err instanceof SolverInputError) {
        await this.prisma.planRuta.update({ where: { id: planRutaId }, data: { estado: 'PENDIENTE' } });
        throw new BadRequestException(`El optimizador no encontró solución: ${err.message}`);
      }

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



  // ============================================================
  // DESPACHO: asignar chofer (y ayudante) a cada camión y sacar los pedidos a la calle
  // ============================================================

  /**
   * Ruteo confirma la hoja: asigna los repartidores a cada envío (camión) y todos los pedidos
   * del plan pasan a "en_ruta". Desde ese momento chofer y ayudante ven la hoja.
   * Todo o nada: si algo falla, no se asigna ni se cambia el estado de ningún pedido.
   */
  async despachar(
    planRutaId: number,
    dto: { asignaciones: { envioId: number; empleadoIds: number[] }[] },
    userId: number,
  ) {
    const plan = await this.findOne(planRutaId);
    if (plan.estado === 'DESPACHADO') throw new BadRequestException('El plan ya fue despachado.');
    if (plan.estado !== 'OPTIMIZADO') {
      throw new BadRequestException('Solo se puede despachar un plan optimizado.');
    }

    // Exactamente un grupo de repartidores por cada envío del plan.
    const enviosDelPlan = plan.envios.map((e) => e.id);
    const asignados = dto.asignaciones.map((a) => a.envioId);
    if (
      new Set(asignados).size !== asignados.length ||
      asignados.length !== enviosDelPlan.length ||
      !enviosDelPlan.every((id) => asignados.includes(id))
    ) {
      throw new BadRequestException('Asigná chofer a cada camión del plan (todos los envíos, sin repetir).');
    }

    const empleadoIds = dto.asignaciones.flatMap((a) => a.empleadoIds);
    if (new Set(empleadoIds).size !== empleadoIds.length) {
      throw new BadRequestException('Un empleado no puede ir en dos camiones a la vez.');
    }
    const validos = await this.prisma.empleado.findMany({
      where: {
        id: { in: empleadoIds },
        activo: true,
        deletedAt: null,
        roles: { some: { nombre: { in: ROLES_REPARTO } } },
      },
      select: { id: true },
    });
    if (validos.length !== empleadoIds.length) {
      throw new BadRequestException(
        'Alguno de los empleados no existe, está inactivo o no tiene rol de reparto (chofer o ayudante).',
      );
    }

    // No pueden estar asignados a otra hoja de ruta ese mismo día.
    const inicio = inicioDiaLocal(plan.fecha);
    const ocupados = await this.prisma.envio.count({
      where: {
        fechaEntrega: { gte: inicio, lt: new Date(inicio.getTime() + DIA_MS) },
        NOT: { planRutaId },
        empleados: { some: { id: { in: empleadoIds } } },
      },
    });
    if (ocupados > 0) {
      throw new BadRequestException('Alguno de los empleados ya está asignado a otra hoja de ruta ese día.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const a of dto.asignaciones) {
          await tx.envio.update({
            where: { id: a.envioId },
            data: { empleados: { set: a.empleadoIds.map((id) => ({ id })) } },
          });
        }
        const pedidos = await tx.pedido.findMany({
          where: { envioId: { in: enviosDelPlan } },
          select: { id: true },
        });
        await this.pedidoService.pasarAEnRuta(tx, pedidos.map((p) => p.id), userId);
        await tx.planRuta.update({ where: { id: planRutaId }, data: { estado: 'DESPACHADO' } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    return this.findOne(planRutaId);
  }

  /** Hoja de ruta de chofer y ayudante: sus envíos despachados con pedidos todavía en la calle. */
  misEnvios(empleadoId: number) {
    return this.prisma.envio.findMany({
      where: {
        empleados: { some: { id: empleadoId } },
        planRuta: { estado: 'DESPACHADO' },
        pedidos: {
          some: { historialEstados: { some: { fechaFin: null, estado: { nombre: 'en_ruta' } } } },
        },
      },
      select: {
        id: true,
        fechaEntrega: true,
        distanciaMetros: true,
        duracionSegundos: true,
        rutaOptima: true,
        camion: { select: { id: true, interno: true, marca: true, modelo: true } },
        empleados: { select: { id: true, nombre: true, apellido: true } },
        planRuta: {
          select: { id: true, fecha: true, deposito: { select: { nombre: true, latitud: true, longitud: true } } },
        },
        pedidos: {
          orderBy: [{ ordenRuta: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            ordenRuta: true,
            llegadaEstimada: true,
            pesoGramos: true,
            comercio: {
              select: { id: true, nombre: true, direccion: true, telefono: true, latitud: true, longitud: true },
            },
            cliente: { select: { nombre: true, apellido: true, telefono: true } },
            articulos: { select: { cantidad: true, articulo: { select: { nombre: true, presentacion: true } } } },
            historialEstados: {
              where: { fechaFin: null },
              select: { estado: { select: { nombre: true, descripcion: true } } },
            },
          },
        },
      },
    });
  }

  /** Fechas en las que se puede armar una hoja de ruta (para el selector del front). */
  /**
   * Elimina un plan que todavía no se optimizó (PENDIENTE) o cuya optimización falló (FALLIDO).
   * Un plan optimizado/despachado ya tiene envíos y pedidos asignados: ahí se usa "volver a optimizar".
   */
  async remove(id: number) {
    const plan = await this.findOne(id);
    if (plan.envios.length > 0 || !['PENDIENTE', 'FALLIDO'].includes(plan.estado)) {
      throw new BadRequestException('Solo se puede eliminar un plan que todavía no fue optimizado.');
    }
    // deleteMany con el estado en el where: si otro usuario lo pasó a EN_PROCESO justo ahora, no borra nada.
    const { count } = await this.prisma.planRuta.deleteMany({
      where: { id, estado: { in: ['PENDIENTE', 'FALLIDO'] }, envios: { none: {} } },
    });
    if (count === 0) throw new BadRequestException('El plan cambió de estado y ya no se puede eliminar.');
    return { message: `Plan #${id} eliminado` };
  }

  /**
   * Cola de ruteo: lo que entraría a la próxima optimización (pedidos armados + ausentes reprogramados).
   * Sirve para que el usuario vea QUÉ va a rutear antes de crear el plan, y cuánto pesa en total.
   */
  async cola() {
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        envioId: null,
        historialEstados: {
          some: { fechaFin: null, estado: { nombre: { in: ['preparado', 'no_entregado'] } } },
        },
      },
      select: {
        id: true,
        pesoGramos: true,
        comercio: { select: { id: true, nombre: true, direccion: true } },
        historialEstados: {
          where: { fechaFin: null },
          select: { estado: { select: { nombre: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });
    const items = pedidos.map((p) => ({
      id: p.id,
      pesoGramos: p.pesoGramos,
      comercio: p.comercio,
      reprogramado: p.historialEstados.some((h) => h.estado.nombre === 'no_entregado'),
    }));
    return {
      pedidos: items.length,
      comercios: new Set(items.map((i) => i.comercio.id)).size,
      pesoTotalGramos: items.reduce((acc, i) => acc + (i.pesoGramos ?? 0), 0),
      reprogramados: items.filter((i) => i.reprogramado).length,
      items,
    };
  }

  /** Choferes/ayudantes activos; `ocupado` = ya figura en otra hoja de ruta el mismo día del plan. */
  async repartidores(planRutaId: number) {
    const plan = await this.findOne(planRutaId);
    const inicio = inicioDiaLocal(plan.fecha);
    const empleados = await this.prisma.empleado.findMany({
      where: { activo: true, deletedAt: null, roles: { some: { nombre: { in: ROLES_REPARTO } } } },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        roles: { select: { nombre: true } },
        enviosTomados: {
          where: {
            fechaEntrega: { gte: inicio, lt: new Date(inicio.getTime() + DIA_MS) },
            NOT: { planRutaId },
          },
          select: { id: true },
        },
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    });
    return empleados.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      apellido: e.apellido,
      roles: e.roles.map((r) => r.nombre),
      ocupado: e.enviosTomados.length > 0,
    }));
  }

  fechasDisponibles(): string[] {
    return fechasDisponibles();
  }

  /**
   * Re-optimizar: borra los envíos del plan y deja sus pedidos otra vez sin asignar.
   * Se niega si alguno ya salió a la calle (en_ruta / entregado / no_entregado).
   */
  private async liberarRutasPrevias(planRutaId: number) {
    await this.prisma.$transaction(async (tx) => {
      const envios = await tx.envio.findMany({ where: { planRutaId }, select: { id: true } });
      if (envios.length === 0) return;
      const ids = envios.map((e) => e.id);

      const yaSalieron = await tx.pedido.count({
        where: {
          envioId: { in: ids },
          historialEstados: {
            some: {
              fechaFin: null,
              estado: { nombre: { in: ['en_ruta', 'entregado', 'no_entregado'] } },
            },
          },
        },
      });
      if (yaSalieron > 0) {
        throw new BadRequestException(
          'No se puede re-optimizar: hay pedidos de este plan que ya salieron a reparto.',
        );
      }

      await tx.pedido.updateMany({
        where: { envioId: { in: ids } },
        data: { envioId: null, ordenRuta: null, llegadaEstimada: null },
      });
      await tx.envio.deleteMany({ where: { id: { in: ids } } });
    });
  }

  private async loadPedidosForOptimization(planRutaId: number) {
    // Cola de ruteo: pedidos armados + clientes ausentes que se reprograman (no_entregado).
    const estadosCola = await this.prisma.estado.findMany({
      where: { nombre: { in: ['preparado', 'no_entregado'] } },
    });
    if (!estadosCola.some((e) => e.nombre === 'preparado')) {
      throw new BadRequestException(
        'No existe el estado "preparado" en la base de datos. ' +
          'Corré el seed para inicializar los estados.',
      );
    }

    return this.prisma.pedido.findMany({
      where: {
        envioId: null,
        historialEstados: {
          some: {
            estadoId: { in: estadosCola.map((e) => e.id) },
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
   * Solo se consideran los camiones elegidos por el usuario al crear el plan.
   */
  private async loadCamionesForOptimization(plan: {
    id: number;
    fecha: Date;
    depositoId: number;
    camiones: { id: number }[];
  }) {
    // Buscar si el PlanRuta fue creado con camionIds explícitos
    // (no está en el schema todavía — este es el camino default)
    const inicioDelDia = inicioDiaLocal(plan.fecha);
    const finDelDia = new Date(inicioDelDia.getTime() + 24 * 3600 * 1000);

    // Camiones ya asignados a envíos de OTROS planes ese día (los del propio plan no cuentan:
    // si no, al re-optimizar quedaban todos los camiones "ocupados" por el plan anterior).
    const camionesOcupados = await this.prisma.envio.findMany({
      where: {
        fechaEntrega: { gte: inicioDelDia, lt: finDelDia },
        NOT: { planRutaId: plan.id },
      },
      select: { camionId: true },
    });
    const ocupadosIds = camionesOcupados.map((e) => e.camionId);

    // Solo los camiones que el usuario ingresó al crear el plan, y que sigan en condiciones.
    const elegidos = plan.camiones.map((c) => c.id).filter((id) => !ocupadosIds.includes(id));

    return this.prisma.camion.findMany({
      where: {
        id: { in: elegidos },
        disponible: true,
        deletedAt: null,
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

    // OR-Tools trabaja con enteros, y OSRM devuelve null donde no encuentra camino:
    // un null convertido a 0 haría creer que dos puntos están pegados.
    const timeMatrix: number[][] = durations.map((fila, i) =>
      fila.map((d, j) => {
        if (d == null || !Number.isFinite(d)) {
          throw new BadRequestException(
            `OSRM no encontró un camino entre los puntos ${i} y ${j}. ` +
              'Revisá que las coordenadas del depósito y los comercios estén dentro de la zona del mapa cargado en OSRM.',
          );
        }
        return Math.round(d);
      }),
    );

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
    // Los HH:MM de depósito y comercios son hora local (Argentina): la base tiene que ser
    // medianoche LOCAL, no UTC, o todo queda corrido 3 horas.
    const inicioDelDia = inicioDiaLocal(plan.fecha);
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
      timeMatrix,
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
    // Los tiempos del solver son segundos desde la medianoche LOCAL del día del plan
    // (misma base que los HH:MM de las ventanas), independiente del TZ del servidor.
    const inicioDiaPlan = inicioDiaLocal(planFecha);

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
          // Un solo UPDATE por parada (no uno por pedido): menos viajes a la base.
          await tx.pedido.updateMany({
            where: { id: { in: parada.pedidos.map((p) => p.id) } },
            data: { envioId: envio.id, ordenRuta: k, llegadaEstimada },
          });
          pedidosAsignados += parada.pedidos.length;
        }
      }

      return {
        enviosCreados,
        pedidosAsignados,
        distanciaTotalMetros: distanciaTotal,
        duracionTotalSegundos: Math.round(duracionTotal),
      };
    }, { timeout: 30_000, maxWait: 10_000 }); // el default de Prisma (5 s) se queda corto con una base remota
  }
}

// ============================================================
// Utilidades privadas del módulo
// ============================================================

const DIA_MS = 24 * 3600 * 1000;
const ROLES_REPARTO = ['chofer', 'ayudante'];

// Se leen al usarse (no al importar el archivo) para no depender del orden en que se carga el .env.
const horaCorte = () => process.env.RUTEO_HORA_CORTE ?? '10:00';
const validarCorteActivo = () => (process.env.RUTEO_VALIDAR_CORTE ?? 'true') !== 'false';

const MAX_DIAS_HABILES_ADELANTE = 3;
// Lunes a viernes por defecto (0 = domingo). Para sumar sábados: RUTEO_DIAS_HABILES=1,2,3,4,5,6
const diasHabiles = () => (process.env.RUTEO_DIAS_HABILES ?? '1,2,3,4,5').split(',').map(Number);
// Feriados como lista "YYYY-MM-DD" separada por comas: RUTEO_FERIADOS=2026-12-08,2026-12-25
const feriados = () => new Set((process.env.RUTEO_FERIADOS ?? '').split(',').map((f) => f.trim()).filter(Boolean));

/** Fecha local (Argentina) como "YYYY-MM-DD". */
export function ymdLocal(fecha: Date): string {
  return new Date(fecha.getTime() + OFFSET_AR_MS).toISOString().slice(0, 10);
}

function esDiaHabil(fecha: Date): boolean {
  const diaSemana = new Date(fecha.getTime() + OFFSET_AR_MS).getUTCDay();
  return diasHabiles().includes(diaSemana) && !feriados().has(ymdLocal(fecha));
}

/** Los próximos días hábiles a partir de mañana, en los que se puede armar una hoja de ruta. */
export function fechasDisponibles(ahora: Date = new Date(), cantidad = MAX_DIAS_HABILES_ADELANTE): string[] {
  const res: string[] = [];
  for (let i = 1; res.length < cantidad && i <= 30; i++) {
    const dia = new Date(ahora.getTime() + i * DIA_MS);
    if (esDiaHabil(dia)) res.push(ymdLocal(dia));
  }
  return res;
}

/**
 * Consigna: la hoja de ruta se arma para el día siguiente. Como ese día puede no ser hábil
 * (fin de semana, feriado) o el cliente ausente necesitar más de un día, el usuario de ruteo
 * elige entre los próximos días hábiles.
 */
export function validarFechaDelPlan(fecha: Date, ahora: Date = new Date()): void {
  if (!validarCorteActivo()) return;
  const disponibles = fechasDisponibles(ahora);
  if (!disponibles.includes(ymdLocal(fecha))) {
    throw new BadRequestException(
      `La hoja de ruta se arma para uno de los próximos días hábiles: ${disponibles.join(', ')}.`,
    );
  }
}

/** Consigna: se puede generar a partir del horario de corte (RUTEO_HORA_CORTE, por defecto 10:00). */
export function validarHorarioDeCorte(ahora: Date = new Date()): void {
  if (!validarCorteActivo()) return;
  const segundosLocal = (ahora.getTime() - inicioDiaLocal(ahora).getTime()) / 1000;
  if (segundosLocal < hhmmToSeconds(horaCorte())) {
    throw new BadRequestException(
      `La hoja de ruta se puede generar a partir de las ${horaCorte()} hs (horario de corte).`,
    );
  }
}

/** Argentina es UTC-3 todo el año (no tiene horario de verano). */
const OFFSET_AR_MS = -3 * 60 * 60 * 1000;

/** Medianoche LOCAL (Argentina) del día de `fecha`, devuelta como instante UTC. */
export function inicioDiaLocal(fecha: Date): Date {
  const local = new Date(fecha.getTime() + OFFSET_AR_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_AR_MS);
}

/** Convierte un string "HH:MM" a segundos desde medianoche. */
function hhmmToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
  return h * 3600 + m * 60;
}
