// ============================================================
// Tipos internos del PlanRutaService.
//
// Estos tipos NO se exportan fuera del módulo — son helpers para
// el método optimize(). El cliente (controller) nunca los ve.
// ============================================================

import type { Comercio, Deposito, Envio, Pedido, Camion } from '@prisma/client';

/** Una parada única en el PlanRuta: un comercio + todos los pedidos que van a él. */
export interface Parada {
  comercio: Pick<Comercio, 'id' | 'latitud' | 'longitud' | 'tiempoServicioMin' |
    'horaAbreMat' | 'horaCierreMat' | 'horaAbreVesp' | 'horaCierreVesp'>;
  pedidos: Pick<Pedido, 'id' | 'pesoGramos'>[];
}

/** Pedidos que NO se pudieron asignar a ningún vehículo. */
export interface PedidoNoAsignable {
  pedidoId: number;
  comercioId: number;
  motivo: string;
}

/** Datos consolidados para construir el SolveVrpInput. */
export interface OptimizerPreparedInput {
  coords: [number, number][];      // [lon, lat] por nodo (depósito + paradas)
  timeMatrix: number[][];          // N×N segundos
  demands: number[];               // gramos por nodo
  timeWindows: [number, number][]; // segundos desde medianoche
  serviceTimes: number[];          // segundos por nodo
  vehicleCapacities: number[];     // gramos por vehículo
  camiones: Camion[];              // para mapear índice → camionId al persistir
  paradas: Parada[];               // para mapear índice → comercioId + pedidos al persistir
  deposito: Deposito;
}

/** Resultado de optimize() — devuelve el PlanRuta actualizado + info de debug. */
export interface OptimizeResult {
  planRutaId: number;
  enviosCreados: number;
  pedidosAsignados: number;
  pedidosNoAsignables: PedidoNoAsignable[];
  distanciaTotalMetros: number;
  duracionTotalSegundos: number;
  objectiveValue: number;
  solverStatus: string;
}
