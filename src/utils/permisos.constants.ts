export const PERMISOS = {
    CLIENTE_CREATE: 'cliente:create',
    CLIENTE_UPDATE: 'cliente:update',
    CLIENTE_DELETE: 'cliente:delete',
    CLIENTE_VIEW: 'cliente:view',
    EMPLEADO_CREATE: 'empleado:create',
    EMPLEADO_UPDATE: 'empleado:update',
    EMPLEADO_DELETE: 'empleado:delete',
    EMPLEADO_VIEW: 'empleado:view',
    ARTICULO_CREATE: 'articulo:create',
    ARTICULO_UPDATE: 'articulo:update',
    ARTICULO_DELETE: 'articulo:delete',
    ARTICULO_VIEW: 'articulo:view',
    MARCA_CREATE: 'marca:create',
    MARCA_UPDATE: 'marca:update',
    MARCA_DELETE: 'marca:delete',
    MARCA_VIEW: 'marca:view',
    ROL_MANAGE: 'rol:manage',
    ROL_VIEW: 'rol:view',
    PEDIDO_CREATE: 'pedido:create',
    PEDIDO_VIEW: 'pedido:view',
    PEDIDO_UPDATE: 'pedido:update',   // modificar en borrador/pendiente
    PEDIDO_CONFIRM: 'pedido:confirm', // cierra borrador, abre pendiente
    PEDIDO_CANCEL: 'pedido:cancel',
} as const;

export type PermisoCodigo = (typeof PERMISOS)[keyof typeof PERMISOS];