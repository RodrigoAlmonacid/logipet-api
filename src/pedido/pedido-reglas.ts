import { MotivoBaja } from '@prisma/client';

// estado actual -> estados a los que se puede ir
export const TRANSICIONES: Record<string, string[]> = {
  borrador: ['pendiente', 'cancelado'],
  pendiente: ['pendiente_preparacion', 'rechazado', 'cancelado'],
  pendiente_preparacion: ['en_preparacion', 'cancelado'],
  en_preparacion: ['preparado', 'pendiente_preparacion', 'cancelado'],
  preparado: ['en_ruta', 'cancelado'],
  en_ruta: ['entregado', 'no_entregado'],
  no_entregado: ['en_ruta', 'cancelado'], // en_ruta = reprogramado al día siguiente
  rechazado: ['borrador', 'cancelado'],
};

export const REGLAS_MOTIVO: Record<MotivoBaja, { devuelveStock: boolean }> = {
  ARREPENTIMIENTO: { devuelveStock: true },
  CLIENTE_RECHAZO: { devuelveStock: true },
  PRODUCTO_DANADO: { devuelveStock: false },
  CLIENTE_AUSENTE: { devuelveStock: false }, // no cancela, así que no aplica
};