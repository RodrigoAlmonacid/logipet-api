import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { calcularLinea } from './calculo-linea';
import { ESTADOS_MODIFICABLES, estadoActivoDe } from './estado-pedido.util';
import { ConflictException } from '@nestjs/common';
import { MotivoBaja, Prisma } from '@prisma/client';
import { TRANSICIONES, REGLAS_MOTIVO } from './pedido-reglas';
import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { PERMISOS } from '../utils/permisos.constants';
import { VISTAS, Vista } from './pedido-vistas';

const PEDIDO_INCLUDE = {
  cliente: true,
  empleado: { select: { id: true, nombre: true, apellido: true } },
  articulos: { include: { articulo: true } },
  historialEstados: { include: { estado: true }, orderBy: { fechaCreac: 'asc' as const } },
};

@Injectable()
export class PedidoService {
  constructor(private readonly prisma: PrismaService) { }

  private conLineasCalculadas(pedido: any) {
    const lineas = pedido.articulos.map((d: any) =>
      calcularLinea({
        articuloId: d.articuloId,
        nombre: d.articulo.nombre,
        cantidad: d.cantidad,
        precioVenta: d.precioVenta,
        descuentoPorcentaje: d.descuentoPorcentaje,
        alicuotaIvaPorcentaje: d.alicuotaIvaPorcentaje,
      }),
    );

    const totales = lineas.reduce(
      (acc: any, l: any) => ({
        neto: acc.neto + l.importeNeto,
        iva: acc.iva + l.importeIva,
        final: acc.final + l.importeFinal,
      }),
      { neto: 0, iva: 0, final: 0 },
    );

    return { ...pedido, lineas, totales };
  }

  private asegurarPropietario(pedido: { empleadoId: number }, empleadoId: number) {
    if (pedido.empleadoId !== empleadoId) {
      throw new BadRequestException('Solo el vendedor que generó el pedido puede modificarlo');
    }
  }

  private async validarClienteYArticulos(
    clienteId: number,
    items: { articuloId: number; cantidad: number; descuentoPorcentaje?: number }[],
  ) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    if (!cliente.activo) throw new BadRequestException('No se pueden asignar pedidos a un cliente inactivo');

    const idsUnicos = [...new Set(items.map((i) => i.articuloId))];
    const articulos = await this.prisma.articulo.findMany({
      where: { id: { in: idsUnicos } },
      include: { alicuotaIva: true },
    });
    if (articulos.length !== idsUnicos.length) {
      throw new BadRequestException('Alguno de los productos indicados no existe');
    }

    this.verificarStock(items, articulos);

    const lineasParaGuardar = items.map((item) => {
      const articulo = articulos.find((a) => a.id === item.articuloId)!;
      return {
        articuloId: articulo.id,
        cantidad: item.cantidad,
        precioVenta: articulo.precio,
        descuentoPorcentaje: item.descuentoPorcentaje ?? 0,
        alicuotaIvaPorcentaje: articulo.alicuotaIva?.porcentaje ?? 0,
      };
    });

    const importe = lineasParaGuardar.reduce(
      (acc, l) => acc + calcularLinea({ ...l, nombre: '' }).importeFinal,
      0,
    );

    return { lineasParaGuardar, importe };
  }

  async create(dto: CreatePedidoDto, empleadoId: number) {
    const { lineasParaGuardar, importe } = await this.validarClienteYArticulos(dto.clienteId, dto.items);

    const pedido = await this.prisma.$transaction(async (tx) => {
      const estadoBorrador = await tx.estado.findUniqueOrThrow({ where: { nombre: 'borrador' } });
      return tx.pedido.create({
        data: {
          clienteId: dto.clienteId,
          empleadoId,
          importe,
          articulos: { create: lineasParaGuardar },
          historialEstados: { create: { estadoId: estadoBorrador.id } },
        },
        include: PEDIDO_INCLUDE,
      });
    });

    return { pedido: this.conLineasCalculadas(pedido) };
  }

  async update(id: number, dto: UpdatePedidoDto, empleadoId: number) {
    const pedidoActual = await this.prisma.pedido.findUnique({
      where: { id },
      include: { historialEstados: { include: { estado: true } } },
    });
    if (!pedidoActual) throw new NotFoundException('Pedido no encontrado');

    this.asegurarPropietario(pedidoActual, empleadoId);

    const { estado } = estadoActivoDe(pedidoActual.historialEstados);
    if (!ESTADOS_MODIFICABLES.includes(estado.nombre)) {
      throw new BadRequestException(`No se puede modificar un pedido en estado "${estado.nombre}"`);
    }

    const { lineasParaGuardar, importe } = await this.validarClienteYArticulos(dto.clienteId, dto.items);

    const pedido = await this.prisma.$transaction(async (tx) => {
      await tx.detallePedido.deleteMany({ where: { pedidoId: id } });

      return tx.pedido.update({
        where: { id },
        data: {
          clienteId: dto.clienteId,
          importe,
          articulos: { create: lineasParaGuardar },
        },
        include: PEDIDO_INCLUDE,
      });
    });

    return { pedido: this.conLineasCalculadas(pedido) };
  }

  private veTodos(user: AuthUser) {
    return user.permisos.includes(PERMISOS.PEDIDO_VIEW_ALL);
  }

  async findAll(user: AuthUser, vista: string) {
    const def = VISTAS[vista as Vista];
    if (!def) throw new BadRequestException(`Vista inválida: "${vista}"`);
    if (!def.permisos.some((p) => user.permisos.includes(p))) {
      throw new ForbiddenException('No tenés permiso para ver esta bandeja');
    }

    const soloPropios =
      def.alcance === 'propios' || (def.alcance === 'segun-view-all' && !this.veTodos(user));

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        ...(soloPropios ? { empleadoId: user.id } : {}),
        historialEstados: { some: { fechaFin: null, estado: { nombre: { in: def.estados } } } },
      },
      include: PEDIDO_INCLUDE,
    });

    // orden de llegada al estado actual (no por id)
    const desde = (p: (typeof pedidos)[number]) => estadoActivoDe(p.historialEstados).fechaCreac.getTime();
    const dir = def.orden === 'asc' ? 1 : -1;
    pedidos.sort((a, b) => dir * (desde(a) - desde(b)));

    return pedidos.map((p) => this.conLineasCalculadas(p));
  }

  private tieneBandeja(user: AuthUser) {
    return [PERMISOS.PEDIDO_APPROVE, PERMISOS.PEDIDO_REJECT, PERMISOS.PEDIDO_PREPARE, PERMISOS.PEDIDO_ROUTE]
      .some((p) => user.permisos.includes(p));
  }

  async findOne(id: number, user?: AuthUser) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: PEDIDO_INCLUDE });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');

    if (user && pedido.empleadoId !== user.id) {
      const esBorrador = estadoActivoDe(pedido.historialEstados).estado.nombre === 'borrador';
      const autorizado = !esBorrador && (this.veTodos(user) || this.tieneBandeja(user));
      if (!autorizado) throw new NotFoundException('Pedido no encontrado');
    }
    return this.conLineasCalculadas(pedido);
  }

  async findOneParaExportar(id: number, empleadoId: number) {
    const pedido = await this.findOne(id);
    this.asegurarPropietario(pedido, empleadoId);

    const { estado } = estadoActivoDe(pedido.historialEstados);
    if (estado.nombre !== 'borrador') {
      throw new BadRequestException('Solo se puede exportar un pedido en estado borrador');
    }
    return pedido;
  }

  // vendedor: rechazado -> borrador, para corregir sin rehacer la venta
  async reabrir(id: number, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({ where: { id } });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      this.asegurarPropietario(pedido, user.id);
      await this.cambiarEstado(tx, id, 'borrador');
    });
    return this.findOne(id);
  }

  private sumarPorArticulo(items: { articuloId: number; cantidad: number }[]) {
    const mapa = new Map<number, number>();
    for (const { articuloId, cantidad } of items) {
      mapa.set(articuloId, (mapa.get(articuloId) ?? 0) + cantidad);
    }
    return mapa;
  }

  private verificarStock(
    items: { articuloId: number; cantidad: number }[],
    articulos: { id: number; nombre: string; stock: number }[],
  ) {
    const errores: string[] = [];
    for (const [id, cantidad] of this.sumarPorArticulo(items)) {
      const art = articulos.find((a) => a.id === id);
      if (!art) {
        errores.push(`El artículo ${id} no existe`);
      } else if (cantidad > art.stock) {
        errores.push(`Stock insuficiente de "${art.nombre}" (pedido: ${cantidad}, disponible: ${art.stock})`);
      }
    }
    if (errores.length) throw new BadRequestException(errores);
  }

  private async cambiarEstado(
    tx: Prisma.TransactionClient,
    pedidoId: number,
    hasta: string,
    extra?: { motivo?: MotivoBaja; observacion?: string },
  ) {
    const historial = await tx.estadoPedido.findMany({
      where: { pedidoId },
      include: { estado: true },
    });
    const activo = estadoActivoDe(historial);

    if (!TRANSICIONES[activo.estado.nombre]?.includes(hasta)) {
      throw new BadRequestException(
        `No se puede pasar de "${activo.estado.nombre}" a "${hasta}"`,
      );
    }

    const nuevo = await tx.estado.findUniqueOrThrow({ where: { nombre: hasta } });

    // condicional: si otro request ya cambió el estado, count será 0
    const { count } = await tx.estadoPedido.updateMany({
      where: { pedidoId, estadoId: activo.estadoId, fechaFin: null },
      data: { fechaFin: new Date() },
    });
    if (count === 0) throw new ConflictException('El pedido cambió de estado, refrescá la pantalla');

    await tx.estadoPedido.create({ data: { pedidoId, estadoId: nuevo.id, ...extra } });
    return activo.estado.nombre; // estado de origen
  }

  private async descontarStock(tx: Prisma.TransactionClient, pedidoId: number) {
    const detalle = await tx.detallePedido.findMany({ where: { pedidoId }, include: { articulo: true } });

    for (const [articuloId, cantidad] of this.sumarPorArticulo(detalle)) {
      const { count } = await tx.articulo.updateMany({
        where: { id: articuloId, stock: { gte: cantidad } }, // valida y descuenta en un paso
        data: { stock: { decrement: cantidad } },
      });
      if (count === 0) {
        const nombre = detalle.find((d) => d.articuloId === articuloId)!.articulo.nombre;
        throw new BadRequestException(`Stock insuficiente de "${nombre}" para aprobar el pedido`);
      }
    }
    await tx.pedido.update({ where: { id: pedidoId }, data: { stockDescontado: true } });
  }

  private async devolverStock(tx: Prisma.TransactionClient, pedidoId: number) {
    const detalle = await tx.detallePedido.findMany({ where: { pedidoId } });
    for (const [articuloId, cantidad] of this.sumarPorArticulo(detalle)) {
      await tx.articulo.update({ where: { id: articuloId }, data: { stock: { increment: cantidad } } });
    }
    await tx.pedido.update({ where: { id: pedidoId }, data: { stockDescontado: false } });
  }

  // vendedor: borrador -> pendiente (reemplaza tu confirmar actual)
  async confirmar(id: number, empleadoId: number) {
    const pedido = await this.prisma.pedido.findUniqueOrThrow({ where: { id } });
    this.asegurarPropietario(pedido, empleadoId);

    await this.prisma.$transaction(async (tx) => {
      const detalle = await tx.detallePedido.findMany({ where: { pedidoId: id }, include: { articulo: true } });
      this.verificarStock(detalle, detalle.map((d) => d.articulo));
      await this.cambiarEstado(tx, id, 'pendiente');
    });
    return this.findOne(id);
  }

  // administración: pendiente -> pendiente_preparacion + descuenta stock
  async aprobar(id: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.cambiarEstado(tx, id, 'pendiente_preparacion');
      await this.descontarStock(tx, id);
    });
    return this.findOne(id);
  }

  // administración: pendiente -> rechazado (todavía no hay nada descontado)
  async rechazar(id: number, observacion: string) {
    await this.prisma.$transaction((tx) => this.cambiarEstado(tx, id, 'rechazado', { observacion }));
    return this.findOne(id);
  }

  async cancelar(id: number, dto: { motivo?: MotivoBaja; observacion?: string }, user: AuthUser) {
    const puedeCualquiera = user.permisos.includes(PERMISOS.PEDIDO_CANCEL_ANY);
    const MOTIVOS_CANCELACION: MotivoBaja[] = ['ARREPENTIMIENTO', 'PRODUCTO_DANADO'];

    await this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id },
        include: { historialEstados: { include: { estado: true } } },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');

      const origen = estadoActivoDe(pedido.historialEstados).estado.nombre;

      if (!puedeCualquiera) {
        if (pedido.empleadoId !== user.id) {
          throw new ForbiddenException('Solo podés cancelar tus propios pedidos');
        }
        if (!['borrador', 'pendiente', 'rechazado'].includes(origen)) {
          throw new ForbiddenException(`No podés cancelar un pedido en estado "${origen}"`);
        }
      }

      if (pedido.stockDescontado) {
        if (!dto.motivo || !MOTIVOS_CANCELACION.includes(dto.motivo)) {
          throw new BadRequestException('Indicá el motivo: arrepentimiento o producto dañado');
        }
      }

      await this.cambiarEstado(tx, id, 'cancelado', dto);

      if (pedido.stockDescontado && REGLAS_MOTIVO[dto.motivo!].devuelveStock) {
        await this.devolverStock(tx, id);
      }
    });

    return this.findOne(id);
  }

  // chofer: en_ruta -> no_entregado (o cancelado si se negó)
  async marcarNoEntregado(id: number, dto: { motivo: MotivoBaja; observacion?: string }) {
    await this.prisma.$transaction(async (tx) => {
      if (dto.motivo === 'CLIENTE_AUSENTE') {
        await this.cambiarEstado(tx, id, 'no_entregado', dto); // stock reservado, se reprograma
      } else {
        await this.cambiarEstado(tx, id, 'no_entregado', dto);
        await this.cambiarEstado(tx, id, 'cancelado', dto);
        if (REGLAS_MOTIVO[dto.motivo].devuelveStock) await this.devolverStock(tx, id);
      }
    });
    return this.findOne(id);
  }

}