import { jest } from '@jest/globals';
import { solve } from './routing-solver';
import {
  SolverInputError,
  SolverInfeasibleError,
} from './routing-solver.types';

// ============================================================
// Tests del RoutingSolver.
//
// Estos tests cargan el runtime WASM de OR-Tools, así que el primer
// test tarda ~5-10s (carga del wasm). Los subsiguientes usan el
// runtime cacheado y son rápidos.
//
// Correr con:  docker compose exec api npx jest src/routing-solver/routing-solver.spec.ts
//
// Fixture: 4 nodos (1 depósito + 3 paradas), 2 vehículos.
// Tiempos simétricos y simples para que el resultado sea predecible.
// ============================================================

// ------------------------------------------------------------
// FIXTURE: 4 nodos, 2 vehículos
// ------------------------------------------------------------
//
//    0 (depósito, demanda 0)
//   / \
//  1   2
//   \ /
//    3
//
// timeMatrix (segundos):
//         to:  0    1    2    3
//   from 0: [ 0, 600, 600, 1200]
//   from 1: [600,  0,  900,  600]
//   from 2: [600, 900,  0,   600]
//   from 3: [1200, 600, 600, 0  ]
//
//   → de 0 a 1: 10 min
//   → de 0 a 2: 10 min
//   → de 0 a 3: 20 min
//   → de 1 a 3: 10 min
//   → de 2 a 3: 10 min
//
// demands: [0, 30, 30, 50] (gramos × 1000 o lo que sea)
// capacities: [100, 100] (cada camión lleva 100)
//   → vehicle 0 puede llevar 1+2 (30+30=60 ≤ 100) o 3 (50 ≤ 100)
//   → vehicle 1 puede llevar cualquiera
//   → óptimo: vehicle 0 lleva 1+2 (60 ≤ 100), vehicle 1 lleva 3 (50 ≤ 100)
//
// timeWindows (segundos desde medianoche):
//   depot: [28800, 72000]  → 08:00 a 20:00
//   node 1: [28800, 86400] → puede recibir cualquier hora del día
//   node 2: [28800, 86400]
//   node 3: [28800, 86400]
//
// serviceTimes: [0, 300, 300, 300] (5 min por parada)
//
// Resultado esperado:
//   routes[0] = [0, 1, 2, 0] (10min + 15min + 15min + 10min = 50min)
//   routes[1] = [0, 3, 0]    (20min + 10min + 20min = 50min)

const FIXTURE_INPUT = {
  timeMatrix: [
    [0, 600, 600, 1200],
    [600, 0, 900, 600],
    [600, 900, 0, 600],
    [1200, 600, 600, 0],
  ],
  demands: [0, 30, 30, 50],
  vehicleCapacities: [100, 100],
  timeWindows: [
    [28800, 72000], // depot: 08:00 - 20:00
    [28800, 86400], // node 1: any time during day
    [28800, 86400], // node 2
    [28800, 86400], // node 3
  ] as [number, number][],
  serviceTimes: [0, 300, 300, 300], // 5 min per stop
  numVehicles: 2,
  depot: 0 as const,
  timeLimitMs: 3000,
};

describe('RoutingSolverService', () => {
  // Aumentamos el timeout porque el primer test carga el WASM runtime.
  jest.setTimeout(30_000);

  describe('solve() — happy path', () => {
    it('encuentra una solución factible para el fixture de 4 nodos', async () => {
      const result = await solve(FIXTURE_INPUT);

      expect(result.status).not.toBe('ROUTING_NOT_SOLVED');
      expect(result.status).not.toBe('FAIL');
      expect(result.status).not.toBe('INFEASIBLE');

      // 2 vehículos → 2 rutas
      expect(result.routes).toHaveLength(2);
      expect(result.arrivals).toHaveLength(2);

      // Cada ruta empieza y termina en el depósito (nodo 0)
      for (const route of result.routes) {
        expect(route[0]).toBe(0);
        expect(route[route.length - 1]).toBe(0);
      }

      // Las 3 paradas deben estar asignadas a algún vehículo
      const allStops = new Set<number>();
      for (const route of result.routes) {
        for (const node of route) {
          if (node !== 0) allStops.add(node);
        }
      }
      expect(allStops.size).toBe(3);
      expect(allStops.has(1)).toBe(true);
      expect(allStops.has(2)).toBe(true);
      expect(allStops.has(3)).toBe(true);

      // No debe haber nodos dropeados
      expect(result.dropped).toHaveLength(0);

      // Los arrival times deben ser timestamps razonables (entre 08:00 y 20:00)
      for (const times of result.arrivals) {
        for (const t of times) {
          expect(t).toBeGreaterThanOrEqual(28800); // >= 08:00
          expect(t).toBeLessThanOrEqual(72000); // <= 20:00
        }
      }

      // El objectiveValue debe ser positivo (suma de tiempos)
      expect(result.objectiveValue).toBeGreaterThan(0);
    });

    it('respeta la capacidad de los vehículos', async () => {
      const result = await solve(FIXTURE_INPUT);

      for (let v = 0; v < result.routes.length; v++) {
        const route = result.routes[v];
        let totalDemand = 0;
        for (const node of route) {
          totalDemand += FIXTURE_INPUT.demands[node];
        }
        // La capacidad del vehículo v (sumando sólo paradas, no depósito al final)
        // El depósito al inicio y final tiene demanda 0, así que totalDemand
        // = suma real de demandas de las paradas visitadas.
        expect(totalDemand).toBeLessThanOrEqual(FIXTURE_INPUT.vehicleCapacities[v]);
      }
    });

    it('devuelve arrivals coherentes con los travel times', async () => {
      const result = await solve(FIXTURE_INPUT);

      for (let v = 0; v < result.routes.length; v++) {
        const route = result.routes[v];
        const times = result.arrivals[v];

        // La cantidad de arrival times debe coincidir con la cantidad de nodos en la ruta
        expect(times).toHaveLength(route.length);

        // Los tiempos deben ser no-decrecientes (siempre vamos hacia adelante en el tiempo)
        for (let k = 1; k < times.length; k++) {
          expect(times[k]).toBeGreaterThanOrEqual(times[k - 1]);
        }

        // El primer arrival (depósito) debe estar dentro del rango [28800, 72000]
        expect(times[0]).toBeGreaterThanOrEqual(28800);
        expect(times[0]).toBeLessThanOrEqual(72000);
      }
    });
  });

  describe('solve() — casos extremos', () => {
    it('funciona con un solo vehículo que debe visitar todas las paradas', async () => {
      const input = {
        ...FIXTURE_INPUT,
        numVehicles: 1,
        vehicleCapacities: [200], // capacidad suficiente para todo
      };

      const result = await solve(input);

      expect(result.routes).toHaveLength(1);
      expect(result.dropped).toHaveLength(0);

      // La ruta única debe visitar todos los nodos
      const route = result.routes[0];
      const visited = new Set(route);
      expect(visited.has(0)).toBe(true);
      expect(visited.has(1)).toBe(true);
      expect(visited.has(2)).toBe(true);
      expect(visited.has(3)).toBe(true);
    });

    it('droppea paradas si la capacidad es insuficiente', async () => {
      // Capacidad insuficiente: 2 vehículos con capacidad 40 cada uno
      // Demanda total: 30+30+50 = 110, capacidad total: 80
      // → al menos 1 parada debe ser dropeada
      const input = {
        ...FIXTURE_INPUT,
        vehicleCapacities: [40, 40],
      };

      const result = await solve(input);

      // Debe dropear al menos un nodo (no debería poder acomodar todo)
      expect(result.dropped.length).toBeGreaterThan(0);

      // La suma de demandas asignadas no debe exceder la capacidad total
      const totalAssigned = result.routes.flat().reduce((sum, node) => sum + input.demands[node], 0);
      const totalCapacity = input.vehicleCapacities.reduce((a, b) => a + b, 0);
      expect(totalAssigned).toBeLessThanOrEqual(totalCapacity);
    });
  });

  describe('solve() — validación de input', () => {
    it('lanza SolverInputError si timeMatrix está vacía', async () => {
      await expect(
        solve({
          timeMatrix: [],
          demands: [],
          vehicleCapacities: [100],
          timeWindows: [],
          serviceTimes: [],
          numVehicles: 1,
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si la matriz no es cuadrada', async () => {
      await expect(
        solve({
          timeMatrix: [[0, 1], [1, 0, 2]], // fila 1 tiene 3 elementos
          demands: [0, 1],
          vehicleCapacities: [100],
          timeWindows: [[0, 86400], [0, 86400]],
          serviceTimes: [0, 0],
          numVehicles: 1,
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si demands no tiene el largo correcto', async () => {
      await expect(
        solve({
          timeMatrix: [[0, 1], [1, 0]],
          demands: [0], // debería tener 2 elementos
          vehicleCapacities: [100],
          timeWindows: [[0, 86400], [0, 86400]],
          serviceTimes: [0, 0],
          numVehicles: 1,
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si la diagonal de timeMatrix no es cero', async () => {
      await expect(
        solve({
          timeMatrix: [[5, 1], [1, 0]], // timeMatrix[0][0] = 5, debería ser 0
          demands: [0, 1],
          vehicleCapacities: [100],
          timeWindows: [[0, 86400], [0, 86400]],
          serviceTimes: [0, 0],
          numVehicles: 1,
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si depot no es 0', async () => {
      await expect(
        solve({
          timeMatrix: [[0, 1], [1, 0]],
          demands: [0, 1],
          vehicleCapacities: [100],
          timeWindows: [[0, 86400], [0, 86400]],
          serviceTimes: [0, 0],
          numVehicles: 1,
          depot: 1 as unknown as 0, // forzamos un valor inválido
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si demands[0] no es 0', async () => {
      await expect(
        solve({
          timeMatrix: [[0, 1], [1, 0]],
          demands: [50, 1], // demands[0] debería ser 0
          vehicleCapacities: [100],
          timeWindows: [[0, 86400], [0, 86400]],
          serviceTimes: [0, 0],
          numVehicles: 1,
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si una time window es inválida (earliest > latest)', async () => {
      await expect(
        solve({
          timeMatrix: [[0, 1], [1, 0]],
          demands: [0, 1],
          vehicleCapacities: [100],
          timeWindows: [[0, 86400], [50000, 40000]], // earliest > latest
          serviceTimes: [0, 0],
          numVehicles: 1,
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });

    it('lanza SolverInputError si vehicleCapacities no coincide con numVehicles', async () => {
      await expect(
        solve({
          timeMatrix: [[0, 1], [1, 0]],
          demands: [0, 1],
          vehicleCapacities: [100, 200], // 2 capacidades
          timeWindows: [[0, 86400], [0, 86400]],
          serviceTimes: [0, 0],
          numVehicles: 1, // pero 1 vehículo
          depot: 0,
        }),
      ).rejects.toThrow(SolverInputError);
    });
  });

  describe('solve() — formato de output', () => {
    it('devuelve rutas que empiezan y terminan en el depósito', async () => {
      const result = await solve(FIXTURE_INPUT);

      for (const route of result.routes) {
        expect(route[0]).toBe(0); // empieza en depósito
        expect(route[route.length - 1]).toBe(0); // termina en depósito
      }
    });

    it('el tamaño de arrivals coincide con el tamaño de routes', async () => {
      const result = await solve(FIXTURE_INPUT);

      expect(result.arrivals).toHaveLength(result.routes.length);
      for (let v = 0; v < result.routes.length; v++) {
        expect(result.arrivals[v]).toHaveLength(result.routes[v].length);
      }
    });

    it('el objectiveValue es un número finito positivo', async () => {
      const result = await solve(FIXTURE_INPUT);

      expect(Number.isFinite(result.objectiveValue)).toBe(true);
      expect(result.objectiveValue).toBeGreaterThan(0);
    });
  });
});
