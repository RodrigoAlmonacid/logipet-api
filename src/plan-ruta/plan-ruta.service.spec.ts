import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PlanRutaService } from './plan-ruta.service';
import { PrismaService } from '../prisma/prisma.service';
import { OsrmService } from '../osrm/osrm.service';
import { DepositoService } from '../deposito/deposito.service';
import { RoutingSolverService } from '../routing-solver/routing-solver.service';

// ============================================================
// Tests del PlanRutaService.
//
// Mockeamos 4 dependencias vía el sistema DI estándar de NestJS:
//   - PrismaService      → mock con jest.fn() por método
//   - OsrmService        → mock con table() y route()
//   - DepositoService    → mock con findOne()
//   - RoutingSolverService → mock con solve() (evita cargar el WASM runtime)
//
// Correr con:  docker compose exec api npm test -- src/plan-ruta
// ============================================================

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

const PLAN_RUTA = {
  id: 1,
  fecha: new Date('2026-11-15T00:00:00.000Z'),
  depositoId: 1,
  horaLimite: new Date('2026-11-15T20:00:00.000Z'),
  estado: 'PENDIENTE',
  createdAt: new Date(),
  updatedAt: new Date(),
  deposito: {
    id: 1,
    nombre: 'Depósito Central Neuquén',
    direccion: 'Av. Argentina 800, Neuquén',
    latitud: -38.9517,
    longitud: -68.0626,
    horaApertura: '08:00',
    horaCierre: '18:00',
    activo: true,
  },
  envios: [],
};

const ESTADO_PREPARADO = { id: 5, nombre: 'preparado', descripcion: 'Preparado' };

const PEDIDOS_FIXTURE = [
  {
    id: 101,
    pesoGramos: 30000, // 30 kg
    comercio: {
      id: 11,
      latitud: -38.94,
      longitud: -68.06,
      tiempoServicioMin: 10,
      horaAbreMat: '08:00',
      horaCierreMat: '13:00',
      horaAbreVesp: '16:00',
      horaCierreVesp: '20:00',
    },
  },
  {
    id: 102,
    pesoGramos: 50000, // 50 kg
    comercio: {
      id: 12,
      latitud: -38.95,
      longitud: -68.10,
      tiempoServicioMin: 10,
      horaAbreMat: '08:00',
      horaCierreMat: '13:00',
      horaAbreVesp: '16:00',
      horaCierreVesp: '20:00',
    },
  },
];

const CAMIONES_FIXTURE = [
  { id: 1, interno: 101, marca: 'Mercedes-Benz', modelo: 'Sprinter', capacidad: 1200, deletedAt: null, disponible: true, createdAt: new Date(), updatedAt: new Date(), capacidadVolumen: null, envios: [] },
];

const DEPOSITO_FIXTURE = {
  id: 1,
  nombre: 'Depósito Central Neuquén',
  direccion: 'Av. Argentina 800, Neuquén',
  latitud: -38.9517,
  longitud: -68.0626,
  horaApertura: '08:00',
  horaCierre: '18:00',
  activo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  planRutas: [],
};

// Resultado mockeado del solver: una ruta que visita ambas paradas
// (asume 3 nodos: depósito + 2 paradas)
const SOLVE_RESULT_3_NODES = {
  routes: [
    [0, 1, 2, 0],
  ],
  arrivals: [
    [28800, 29400, 30600, 32400],
  ],
  dropped: [],
  status: 'SUCCESS' as const,
  objectiveValue: 3600,
};

// Resultado mockeado para el test de consolidación: 2 nodos (depósito + 1 parada)
const SOLVE_RESULT_2_NODES = {
  routes: [
    [0, 1, 0],
  ],
  arrivals: [
    [28800, 29400, 30000],
  ],
  dropped: [],
  status: 'SUCCESS' as const,
  objectiveValue: 1200,
};

// Resultado mockeado para el test de drops: parada 2 (node index 2) fue dropeada
const SOLVE_RESULT_WITH_DROP = {
  routes: [
    [0, 1, 0], // vehicle 0 sólo visita parada 1
  ],
  arrivals: [
    [28800, 29400, 30000],
  ],
  dropped: [2], // parada 2 (comercio 12) fue dropeada
  status: 'SUCCESS' as const,
  objectiveValue: 1200,
};

// Resultado mockeado de OSRM /route (no depende del tamaño)
const OSRM_ROUTE_RESULT = {
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [-68.0626, -38.9517],
      [-68.06, -38.94],
      [-68.10, -38.95],
      [-68.0626, -38.9517],
    ],
  },
  distance: 18000,
  duration: 1800,
};

/**
 * Genera una matriz N×N simétrica de tiempos "inventados" pero válidos.
 * La usa el mock de osrmService.table para que devuelva una matriz
 * del tamaño correcto sin importar cuánt coords le pasen.
 */
function generateTimeMatrix(n: number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) row.push(0);
      else row.push(600 + Math.abs(i - j) * 100); // tiempos fake pero razonables
    }
    m.push(row);
  }
  return m;
}

function generateDistanceMatrix(n: number): number[][] {
  return generateTimeMatrix(n).map((row) => row.map((t) => t * 10));
}

// ------------------------------------------------------------
// Helpers para construir el mock de Prisma
// ------------------------------------------------------------

function createPrismaMock() {
  const mock = {
    planRuta: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pedido: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    camion: {
      findMany: jest.fn(),
    },
    envio: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    estado: {
      findUnique: jest.fn(),
    },
    deposito: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(mock)),
  };
  return mock as unknown as PrismaService & ReturnType<typeof createPrismaMock>;
}

describe('PlanRutaService', () => {
  let service: PlanRutaService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let osrmService: { table: jest.Mock; route: jest.Mock };
  let depositoService: { findOne: jest.Mock };
  let solverService: { solve: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    osrmService = {
      table: jest.fn(),
      route: jest.fn(),
    };
    depositoService = {
      findOne: jest.fn(),
    };
    solverService = {
      solve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanRutaService,
        { provide: PrismaService, useValue: prisma },
        { provide: OsrmService, useValue: osrmService },
        { provide: DepositoService, useValue: depositoService },
        { provide: RoutingSolverService, useValue: solverService },
      ],
    }).compile();

    service = module.get(PlanRutaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------
  // create()
  // ------------------------------------------------------------

  describe('create()', () => {
    const createDto = {
      fecha: '2026-11-15T00:00:00.000Z',
      depositoId: 1,
      horaLimite: '2026-11-15T20:00:00.000Z',
    };

    it('crea un PlanRuta cuando el depósito está activo y la horaLimite es válida', async () => {
      depositoService.findOne.mockResolvedValueOnce({
        ...DEPOSITO_FIXTURE,
        activo: true,
      });
      prisma.planRuta.create.mockResolvedValueOnce(PLAN_RUTA);

      const result = await service.create(createDto);

      expect(result).toEqual(PLAN_RUTA);
      expect(prisma.planRuta.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            depositoId: 1,
            estado: 'PENDIENTE',
          }),
        }),
      );
    });

    it('lanza BadRequestException si el depósito no está activo', async () => {
      depositoService.findOne.mockResolvedValueOnce({
        ...DEPOSITO_FIXTURE,
        activo: false,
      });

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      expect(prisma.planRuta.create).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si horaLimite ≤ fecha', async () => {
      depositoService.findOne.mockResolvedValueOnce(DEPOSITO_FIXTURE);

      await expect(
        service.create({
          ...createDto,
          horaLimite: '2026-11-14T20:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si camionIds no existen', async () => {
      depositoService.findOne.mockResolvedValueOnce(DEPOSITO_FIXTURE);
      prisma.camion.findMany.mockResolvedValueOnce([]);

      await expect(
        service.create({ ...createDto, camionIds: [999] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ------------------------------------------------------------
  // findAll() / findOne() / updateEstado()
  // ------------------------------------------------------------

  describe('findAll()', () => {
    it('devuelve todos los planes ordenados por fecha desc', async () => {
      prisma.planRuta.findMany.mockResolvedValueOnce([PLAN_RUTA]);

      const result = await service.findAll();

      expect(result).toEqual([PLAN_RUTA]);
      expect(prisma.planRuta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ fecha: 'desc' }],
        }),
      );
    });
  });

  describe('findOne()', () => {
    it('devuelve el plan cuando existe', async () => {
      prisma.planRuta.findUnique.mockResolvedValueOnce(PLAN_RUTA);

      const result = await service.findOne(1);

      expect(result).toEqual(PLAN_RUTA);
    });

    it('lanza NotFoundException cuando no existe', async () => {
      prisma.planRuta.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateEstado()', () => {
    it('actualiza el estado cuando es válido', async () => {
      prisma.planRuta.findUnique.mockResolvedValueOnce(PLAN_RUTA);
      prisma.planRuta.update.mockResolvedValueOnce({
        ...PLAN_RUTA,
        estado: 'FINALIZADO',
      });

      const result = await service.updateEstado(1, 'FINALIZADO');

      expect(result.estado).toBe('FINALIZADO');
    });

    it('lanza BadRequestException cuando el estado no es válido', async () => {
      prisma.planRuta.findUnique.mockResolvedValueOnce(PLAN_RUTA);

      await expect(service.updateEstado(1, 'INVALIDO')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ------------------------------------------------------------
  // optimize() — el método principal
  // ------------------------------------------------------------

  describe('optimize()', () => {
    beforeEach(() => {
      // Setup default para todos los tests de optimize
      prisma.planRuta.findUnique.mockResolvedValue(PLAN_RUTA);
      prisma.planRuta.update.mockResolvedValue(PLAN_RUTA);
      prisma.estado.findUnique.mockResolvedValue(ESTADO_PREPARADO);
      prisma.pedido.findMany.mockResolvedValue(PEDIDOS_FIXTURE);
      prisma.envio.findMany.mockResolvedValue([]); // ningún camión ocupado
      prisma.camion.findMany.mockResolvedValue(CAMIONES_FIXTURE);
      prisma.envio.create.mockImplementation(({ data }: { data: { camionId: number } }) =>
        Promise.resolve({ id: 999, camionId: data.camionId, fechaEntrega: new Date() }),
      );
      prisma.pedido.update.mockResolvedValue({});

      // Mock dinámico de osrm.table: devuelve una matriz del tamaño correcto
      osrmService.table.mockImplementation((coords: [number, number][]) => {
        const n = coords.length;
        return Promise.resolve({
          durations: generateTimeMatrix(n),
          distances: generateDistanceMatrix(n),
        });
      });
      osrmService.route.mockResolvedValue(OSRM_ROUTE_RESULT);

      // Mock default del solver: asume 3 nodos (depósito + 2 paradas)
      solverService.solve.mockResolvedValue(SOLVE_RESULT_3_NODES);
    });

    it('optimiza exitosamente cuando todo está en orden', async () => {
      const result = await service.optimize(1, { timeLimitMs: 5000 });

      expect(result.planRutaId).toBe(1);
      expect(result.enviosCreados).toBe(1);
      expect(result.pedidosAsignados).toBe(2);
      expect(result.pedidosNoAsignables).toHaveLength(0);
      expect(result.solverStatus).toBe('SUCCESS');

      // Verificamos que se llamó OSRM table con las coords correctas
      expect(osrmService.table).toHaveBeenCalledWith([
        [-68.0626, -38.9517], // depósito
        [-68.06, -38.94],     // parada 1 (comercio 11)
        [-68.10, -38.95],     // parada 2 (comercio 12)
      ]);

      // Verificamos que se llamó OSRM route con el orden del solver
      expect(osrmService.route).toHaveBeenCalledWith([
        [-68.0626, -38.9517],
        [-68.06, -38.94],
        [-68.10, -38.95],
        [-68.0626, -38.9517],
      ]);

      // Verificamos que el PlanRuta se marcó como OPTIMIZADO al final
      const updateCalls = prisma.planRuta.update.mock.calls;
      const lastUpdate = updateCalls[updateCalls.length - 1][0];
      expect(lastUpdate.data.estado).toBe('OPTIMIZADO');
    });

    it('lanza BadRequestException si el plan ya está OPTIMIZADO', async () => {
      prisma.planRuta.findUnique.mockResolvedValue({
        ...PLAN_RUTA,
        estado: 'OPTIMIZADO',
      });

      await expect(service.optimize(1)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el plan está EN_PROCESO', async () => {
      prisma.planRuta.findUnique.mockResolvedValue({
        ...PLAN_RUTA,
        estado: 'EN_PROCESO',
      });

      await expect(service.optimize(1)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no hay pedidos preparados', async () => {
      prisma.pedido.findMany.mockResolvedValueOnce([]);

      await expect(service.optimize(1)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no hay camiones disponibles', async () => {
      prisma.camion.findMany.mockResolvedValueOnce([]);

      await expect(service.optimize(1)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no existe el estado "preparado"', async () => {
      prisma.estado.findUnique.mockResolvedValueOnce(null);

      await expect(service.optimize(1)).rejects.toThrow(BadRequestException);
    });

    it('marca el PlanRuta como FALLIDO si el solver falla', async () => {
      solverService.solve.mockRejectedValueOnce(new Error('OR-Tools crashed'));

      await expect(service.optimize(1)).rejects.toThrow();

      const updateCalls = prisma.planRuta.update.mock.calls;
      const lastUpdate = updateCalls[updateCalls.length - 1][0];
      expect(lastUpdate.data.estado).toBe('FALLIDO');
    });

    it('persiste la geometría como GeoJSON FeatureCollection en rutaOptima', async () => {
      await service.optimize(1);

      const envioCreateCall = prisma.envio.create.mock.calls[0][0];
      expect(envioCreateCall.data.rutaOptima).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: OSRM_ROUTE_RESULT.geometry,
            properties: {
              vehicle: 0,
              distance: OSRM_ROUTE_RESULT.distance,
              duration: OSRM_ROUTE_RESULT.duration,
            },
          },
        ],
      });
    });

    it('asigna llegadaEstimada a cada pedido basado en arrivals del solver', async () => {
      await service.optimize(1);

      expect(prisma.pedido.update).toHaveBeenCalledTimes(2);

      const firstUpdate = prisma.pedido.update.mock.calls[0][0];
      expect(firstUpdate.data.ordenRuta).toBe(1);
      // 29400s desde medianoche UTC del 2026-11-15 = 2026-11-15T08:10:00.000Z
      // (setUTCHours(0,0,0,0) sobre 2026-11-15T00:00:00.000Z = mismo momento,
      //  + 29400 segundos = 2026-11-15T08:10:00.000Z)
      expect(firstUpdate.data.llegadaEstimada.toISOString()).toBe('2026-11-15T08:10:00.000Z');
    });

    it('consolida múltiples pedidos al mismo comercio en una sola parada', async () => {
      // Dos pedidos al mismo comercio 11 → consolidan en 1 parada
      // Total nodes: 2 (depósito + 1 parada unificada)
      prisma.pedido.findMany.mockResolvedValueOnce([
        PEDIDOS_FIXTURE[0], // comercio 11, pedido 101
        { ...PEDIDOS_FIXTURE[0], id: 103, pesoGramos: 20000 }, // comercio 11, pedido 103
      ]);
      // El solver recibe 2 nodos → le damos un resultado de 2 nodos
      solverService.solve.mockResolvedValueOnce(SOLVE_RESULT_2_NODES);

      await service.optimize(1);

      const tableCall = osrmService.table.mock.calls[0][0];
      expect(tableCall).toHaveLength(2); // depósito + 1 parada unificada

      // Verificamos que la matriz pasada al solver es 2×2
      const solverCall = solverService.solve.mock.calls[0][0];
      expect(solverCall.timeMatrix).toHaveLength(2);
      expect(solverCall.timeMatrix[0]).toHaveLength(2);
    });

    it('propaga pedidos dropeados como pedidosNoAsignables', async () => {
      solverService.solve.mockResolvedValueOnce(SOLVE_RESULT_WITH_DROP);

      const result = await service.optimize(1);

      expect(result.pedidosNoAsignables).toHaveLength(1);
      expect(result.pedidosNoAsignables[0].pedidoId).toBe(102);
      expect(result.pedidosNoAsignables[0].comercioId).toBe(12);
    });
  });
});
