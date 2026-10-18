import { PERMISOS as P } from '../utils/permisos.constants';

export type Vista =
  | 'borradores' | 'rechazados' | 'en-proceso' | 'finalizados'
  | 'administracion' | 'deposito' | 'ruteo';

interface DefVista {
  estados: string[];
  permisos: string[]; // alcanza con uno
  alcance: 'propios' | 'segun-view-all' | 'todos';
  orden: 'asc' | 'desc'; // sobre la fecha en que entró al estado actual
}

export const VISTAS: Record<Vista, DefVista> = {
  // privadas del dueño, ni view_all las incluye
  borradores: { estados: ['borrador'], permisos: [P.PEDIDO_VIEW], alcance: 'propios', orden: 'desc' },
  rechazados: { estados: ['rechazado'], permisos: [P.PEDIDO_VIEW], alcance: 'propios', orden: 'desc' },

  // seguimiento: propios, o todos si tiene view_all (supervisión)
  'en-proceso': {
    estados: ['pendiente', 'pendiente_preparacion', 'en_preparacion', 'preparado', 'en_ruta', 'no_entregado'],
    permisos: [P.PEDIDO_VIEW, P.PEDIDO_VIEW_ALL], alcance: 'segun-view-all', orden: 'desc',
  },
  finalizados: {
    estados: ['entregado', 'cancelado'],
    permisos: [P.PEDIDO_VIEW, P.PEDIDO_VIEW_ALL], alcance: 'segun-view-all', orden: 'desc',
  },

  // bandejas de trabajo: de cualquier dueño, más viejos primero
  administracion: { estados: ['pendiente'], permisos: [P.PEDIDO_APPROVE, P.PEDIDO_REJECT], alcance: 'todos', orden: 'asc' },
  deposito: { estados: ['pendiente_preparacion', 'en_preparacion'], permisos: [P.PEDIDO_PREPARE], alcance: 'todos', orden: 'asc' },
  ruteo: { estados: ['preparado', 'no_entregado'], permisos: [P.PEDIDO_ROUTE], alcance: 'todos', orden: 'asc' },
};