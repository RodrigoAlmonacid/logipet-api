export interface HistorialEstadoConEstado {
  estadoId: number;
  fechaFin: Date | null;
  estado: { nombre: string };
}

export const ESTADOS_MODIFICABLES = ['borrador', 'pendiente'];

/** Devuelve la fila de historial sin fechaFin: el estado vigente del pedido. */
export function estadoActivoDe<T extends HistorialEstadoConEstado>(historial: T[]): T {
  const activo = historial.find((h) => h.fechaFin === null);
  if (!activo) throw new Error('El pedido no tiene un estado activo'); // no debería pasar nunca
  return activo;
}