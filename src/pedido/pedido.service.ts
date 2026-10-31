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
import { calcularPeso } from './calculo-peso';
import { VerificarLineaDto } from './dto/verificar-linea.dto';

const EMPLEADO_RESUMEN = { select: { id: true, nombre: true, apellido: true } };

const PEDIDO_INCLUDE = {
  cliente: true,
  empleado: { select: { id: true, nombre: true, apellido: true } },
  articulos: { include: { articulo: true } },
  historialEstados: {
    include: { estado: true, auditor: EMPLEADO_RESUMEN },
    orderBy: { fechaCreac: 'asc' as const },
  },
  comercio: true,
  operario: EMPLEADO_RESUMEN,
};


@Injectable()
export class PedidoService {
  constructor(private readonly prisma: PrismaService) { }

  private conLineasCalculadas(pedido: any) {
    const lineas = pedido.articulos.map((d: any) => ({
      ...calcularLinea({
        articuloId: d.articuloId,
        nombre: d.articulo.nombre,
        cantidad: d.cantidad,
        precioVenta: d.precioVenta,
        descuentoPorcentaje: d.descuentoPorcentaje,
        alicuotaIvaPorcentaje: d.alicuotaIvaPorcentaje,
      }),
      pesoGramos: d.pesoUnitarioGramos === null ? null : d.pesoUnitarioGramos * d.cantidad,
      codigo: d.articulo.codigo,
      presentacion: d.articulo.presentacion,
      verificado: d.verificado,
      cantidadOriginal: d.cantidadOriginal,
      justificacionAjuste: d.justificacionAjuste,
    }));

    const totales = lineas.reduce(
      (acc: any, l: any) => ({
        neto: acc.neto + l.importeNeto,
        iva: acc.iva + l.importeIva,
        final: acc.final + l.importeFinal,
      }),
      { neto: 0, iva: 0, final: 0 },
    );

    const { pesoIncompleto } = calcularPeso(pedido.articulos);
    return { ...pedido, lineas, totales, pesoIncompleto };
  }

  private asegurarPropietario(pedido: { empleadoId: number }, empleadoId: number) {
    if (pedido.empleadoId !== empleadoId) {
      throw new BadRequestException('Solo el vendedor que generó el pedido puede modificarlo');
    }
  }

  private async validarClienteYArticulos(
    clienteId: number,
    comercioId: number,
    items: { articuloId: number; cantidad: number; descuentoPorcentaje?: number }[],
  ) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    if (!cliente.activo) throw new BadRequestException('No se pueden asignar pedidos a un cliente inactivo');

    const comercio = await this.prisma.comercio.findUnique({ where: { id: comercioId } });
    if (!comercio || comercio.clienteId !== clienteId) {
      throw new BadRequestException('El punto de entrega no pertenece al cliente');
    }
    if (!comercio.activo) throw new BadRequestException('El punto de entrega está inactivo');


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
        pesoUnitarioGramos: articulo.pesoGramos, // null = sin peso cargado
      };
    });

    const importe = lineasParaGuardar.reduce(
      (acc, l) => acc + calcularLinea({ ...l, nombre: '' }).importeFinal,
      0,
    );
    const { pesoGramos } = calcularPeso(lineasParaGuardar);

    return { lineasParaGuardar, importe, pesoGramos };
  }

  async create(dto: CreatePedidoDto, empleadoId: number) {
    const { lineasParaGuardar, importe, pesoGramos } = await this.validarClienteYArticulos(dto.clienteId, dto.comercioId, dto.items);

    const pedido = await this.prisma.$transaction(async (tx) => {
      const estadoBorrador = await tx.estado.findUniqueOrThrow({ where: { nombre: 'borrador' } });
      return tx.pedido.create({
        data: {
          clienteId: dto.clienteId,
          empleadoId,
          importe,
          pesoGramos,
          articulos: { create: lineasParaGuardar },
          historialEstados: { create: { estadoId: estadoBorrador.id, auditorId: empleadoId } },
          comercioId: dto.comercioId,
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

    const { lineasParaGuardar, importe, pesoGramos } = await this.validarClienteYArticulos(dto.clienteId, dto.comercioId, dto.items);

    const pedido = await this.prisma.$transaction(async (tx) => {
      await tx.detallePedido.deleteMany({ where: { pedidoId: id } });

      return tx.pedido.update({
        where: { id },
        data: {
          clienteId: dto.clienteId,
          importe,
          pesoGramos,
          articulos: { create: lineasParaGuardar },
          comercioId: dto.comercioId,
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
      await this.cambiarEstado(tx, id, 'borrador', user.id);
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
    auditorId: number,
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

    await tx.estadoPedido.create({ data: { pedidoId, estadoId: nuevo.id, auditorId, ...extra } });
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

      // refrescar la foto del peso con el catálogo actual
      for (const articuloId of new Set(detalle.map((d) => d.articuloId))) {
        const peso = detalle.find((d) => d.articuloId === articuloId)!.articulo.pesoGramos;
        await tx.detallePedido.updateMany({
          where: { pedidoId: id, articuloId },
          data: { pesoUnitarioGramos: peso },
        });
      }
      const { pesoGramos } = calcularPeso(
        detalle.map((d) => ({ cantidad: d.cantidad, pesoUnitarioGramos: d.articulo.pesoGramos })),
      );
      await tx.pedido.update({ where: { id }, data: { pesoGramos } });

      await this.cambiarEstado(tx, id, 'pendiente', empleadoId);
    });
    return this.findOne(id);
  }

  // administración: pendiente -> pendiente_preparacion + descuenta stock
  async aprobar(id: number, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.cambiarEstado(tx, id, 'pendiente_preparacion', userId);
      await this.descontarStock(tx, id);
    });
    return this.findOne(id);
  }

  // administración: pendiente -> rechazado (todavía no hay nada descontado)
  async rechazar(id: number, observacion: string, userId: number) {
    await this.prisma.$transaction((tx) => this.cambiarEstado(tx, id, 'rechazado', userId, { observacion }));
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

      await this.cambiarEstado(tx, id, 'cancelado', user.id, dto);

      if (pedido.stockDescontado && REGLAS_MOTIVO[dto.motivo!].devuelveStock) {
        await this.devolverStock(tx, id);
      }
    });

    return this.findOne(id);
  }

  // chofer: en_ruta -> no_entregado (o cancelado si se negó)
  async marcarNoEntregado(id: number, dto: { motivo: MotivoBaja; observacion?: string }, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      if (dto.motivo === 'CLIENTE_AUSENTE') {
        await this.cambiarEstado(tx, id, 'no_entregado', userId, dto); // stock reservado, se reprograma
      } else {
        await this.cambiarEstado(tx, id, 'no_entregado', userId, dto);
        await this.cambiarEstado(tx, id, 'cancelado', userId, dto);
        if (REGLAS_MOTIVO[dto.motivo].devuelveStock) await this.devolverStock(tx, id);
      }
    });
    return this.findOne(id);
  }

  // ---------- depósito ----------
  private async pedidoEnPreparacionDe(tx: Prisma.TransactionClient, id: number, userId: number) {
    const pedido = await tx.pedido.findUnique({
      where: { id },
      include: { historialEstados: { include: { estado: true } } },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (pedido.operarioId !== userId) throw new ForbiddenException('Este pedido no lo estás preparando vos');
    if (estadoActivoDe(pedido.historialEstados).estado.nombre !== 'en_preparacion') {
      throw new BadRequestException('El pedido no está en preparación');
    }
    return pedido;
  }

  private async recalcularTotales(tx: Prisma.TransactionClient, pedidoId: number) {
    const detalle = await tx.detallePedido.findMany({ where: { pedidoId } });
    const importe = detalle.reduce(
      (acc, d) =>
        acc +
        calcularLinea({
          articuloId: d.articuloId,
          nombre: '',
          cantidad: d.cantidad,
          precioVenta: d.precioVenta,
          descuentoPorcentaje: d.descuentoPorcentaje,
          alicuotaIvaPorcentaje: d.alicuotaIvaPorcentaje,
        }).importeFinal,
      0,
    );
    const { pesoGramos } = calcularPeso(detalle);
    await tx.pedido.update({ where: { id: pedidoId }, data: { importe, pesoGramos } });
  }

  // el pedido que el operario dejó a medias (para retomarlo al reabrir la app)
  async enPreparacionDe(userId: number) {
    const pedido = await this.prisma.pedido.findFirst({ where: { operarioId: userId }, include: PEDIDO_INCLUDE });
    return pedido ? this.conLineasCalculadas(pedido) : null;
  }

  async tomar(id: number, userId: number) {
    const enCurso = await this.prisma.pedido.findFirst({ where: { operarioId: userId }, select: { id: true } });
    if (enCurso) throw new ConflictException(`Ya tenés el pedido #${enCurso.id} en preparación`);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.cambiarEstado(tx, id, 'en_preparacion', userId);
        await tx.pedido.update({ where: { id }, data: { operarioId: userId } });
      });
    } catch (e) {
      // dos requests a la vez del mismo operario: lo frena el @unique
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya tenés un pedido en preparación');
      }
      throw e;
    }
    return this.findOne(id);
  }

  async soltar(id: number, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.pedidoEnPreparacionDe(tx, id, userId);
      await this.cambiarEstado(tx, id, 'pendiente_preparacion', userId); // libera operarioId
      await tx.detallePedido.updateMany({ where: { pedidoId: id }, data: { verificado: false } });
    });
    return this.findOne(id);
  }

  async verificarLinea(id: number, articuloId: number, dto: VerificarLineaDto, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.pedidoEnPreparacionDe(tx, id, userId);

      const where = { pedidoId_articuloId: { pedidoId: id, articuloId } };
      const linea = await tx.detallePedido.findUnique({ where, include: { articulo: true } });
      if (!linea) throw new NotFoundException('El artículo no pertenece al pedido');

      // el código viene del escáner: se valida acá, no solo en el front
      if (linea.articulo.codigo !== dto.codigo.trim()) {
        throw new BadRequestException('El código escaneado no corresponde a este artículo');
      }
      if (dto.cantidad > linea.cantidad) {
        throw new BadRequestException(`No podés superar la cantidad pedida (${linea.cantidad})`);
      }

      const faltante = linea.cantidad - dto.cantidad;
      if (faltante > 0 && !dto.justificacion?.trim()) {
        throw new BadRequestException('Indicá una justificación del faltante');
      }

      await tx.detallePedido.update({
        where,
        data: {
          cantidad: dto.cantidad,
          verificado: true,
          ...(faltante > 0
            ? { cantidadOriginal: linea.cantidadOriginal ?? linea.cantidad, justificacionAjuste: dto.justificacion!.trim() }
            : {}),
        },
      });

      if (faltante > 0) {
        // el stock se descontó al aprobar: se devuelve la diferencia
        await tx.articulo.update({ where: { id: articuloId }, data: { stock: { increment: faltante } } });
        await this.recalcularTotales(tx, id);
      }
    });
    return this.findOne(id);
  }

  async preparado(id: number, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.pedidoEnPreparacionDe(tx, id, userId);

      const detalle = await tx.detallePedido.findMany({ where: { pedidoId: id } });
      if (detalle.some((d) => !d.verificado)) throw new BadRequestException('Faltan verificar artículos');
      if (detalle.every((d) => d.cantidad === 0)) {
        throw new BadRequestException('El pedido quedó sin artículos: pedile a administración que lo cancele');
      }
      await this.cambiarEstado(tx, id, 'preparado', userId); // libera operarioId
    });
    return this.findOne(id);
  }

}