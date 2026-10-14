import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';

const PEDIDO_INCLUDE = {
  cliente: true,
  empleado: { select: { id: true, nombre: true, apellido: true } },
  articulos: { include: { articulo: true } },
  historialEstados: { include: { estado: true }, orderBy: { fechaCreac: 'asc' as const } },
};

@Injectable()
export class PedidoService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Helpers compartidos por update/confirmar/cancelar ---

  private async findConEstadoActual(id: number) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: PEDIDO_INCLUDE });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');

    const estadoActual = pedido.historialEstados.find((h) => h.fechaFin === null);
    if (!estadoActual) throw new BadRequestException('El pedido no tiene un estado activo'); // no debería pasar nunca

    return { pedido, estadoActual };
  }

  private asegurarEstadoPermitido(nombreEstadoActual: string, permitidos: string[]) {
    if (!permitidos.includes(nombreEstadoActual)) {
      throw new BadRequestException(
        `Esta acción no es válida en estado "${nombreEstadoActual}". Estados permitidos: ${permitidos.join(', ')}`,
      );
    }
  }

  private async cerrarEstadoYAbrirUno(tx: any, pedidoId: number, estadoAnteriorId: number, nombreEstadoNuevo: string) {
    const estadoNuevo = await tx.estado.findUniqueOrThrow({ where: { nombre: nombreEstadoNuevo } });

    await tx.estadoPedido.updateMany({
      where: { pedidoId, estadoId: estadoAnteriorId, fechaFin: null },
      data: { fechaFin: new Date() },
    });

    await tx.estadoPedido.create({
      data: { pedidoId, estadoId: estadoNuevo.id },
    });
  }

  // --- Acciones ---

  async create(dto: CreatePedidoDto, empleadoId: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    if (!cliente.activo) throw new BadRequestException('No se pueden asignar pedidos a un cliente inactivo');

    const articulos = await this.prisma.articulo.findMany({
      where: { id: { in: dto.items.map((i) => i.articuloId) } },
    });
    if (articulos.length !== dto.items.length) {
      throw new BadRequestException('Alguno de los productos indicados no existe');
    }

    const avisos: string[] = [];
    const lineas = dto.items.map((item) => {
      const articulo = articulos.find((a) => a.id === item.articuloId)!;
      if (articulo.stock < item.cantidad) {
        avisos.push(`"${articulo.nombre}" tiene stock insuficiente (disponible: ${articulo.stock}, pedido: ${item.cantidad})`);
      }
      return { articuloId: articulo.id, cantidad: item.cantidad, precioVenta: articulo.precio };
    });

    const importe = lineas.reduce((acc, l) => acc + l.cantidad * l.precioVenta, 0);

    const pedido = await this.prisma.$transaction(async (tx) => {
      const estadoBorrador = await tx.estado.findUniqueOrThrow({ where: { nombre: 'borrador' } });

      const creado = await tx.pedido.create({
        data: {
          clienteId: dto.clienteId,
          empleadoId,
          importe,
          articulos: { create: lineas },
          historialEstados: { create: { estadoId: estadoBorrador.id } },
        },
        include: PEDIDO_INCLUDE,
      });

      return creado;
    });

    return { pedido, avisos };
  }

  async update(id: number, dto: UpdatePedidoDto, empleadoId: number) {
    const { pedido, estadoActual } = await this.findConEstadoActual(id);
    this.asegurarEstadoPermitido(estadoActual.estado.nombre, ['borrador', 'pendiente']);
    this.asegurarPropietario(pedido, empleadoId);

    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    if (!cliente.activo) throw new BadRequestException('No se pueden asignar pedidos a un cliente inactivo');

    const articulos = await this.prisma.articulo.findMany({
      where: { id: { in: dto.items.map((i) => i.articuloId) } },
    });

    const avisos: string[] = [];
    const lineas = dto.items.map((item) => {
      const articulo = articulos.find((a) => a.id === item.articuloId)!;
      if (articulo.stock < item.cantidad) {
        avisos.push(`"${articulo.nombre}" tiene stock insuficiente (disponible: ${articulo.stock}, pedido: ${item.cantidad})`);
      }
      return { articuloId: articulo.id, cantidad: item.cantidad, precioVenta: articulo.precio };
    });

    const importe = lineas.reduce((acc, l) => acc + l.cantidad * l.precioVenta, 0);

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await tx.detallePedido.deleteMany({ where: { pedidoId: id } });
      return tx.pedido.update({
        where: { id },
        data: { clienteId: dto.clienteId, importe, articulos: { create: lineas } },
        include: PEDIDO_INCLUDE,
      });
    });

    return { pedido: actualizado, avisos };
  }

  async confirmar(id: number, empleadoId: number) {
    const { pedido, estadoActual } = await this.findConEstadoActual(id);
    this.asegurarEstadoPermitido(estadoActual.estado.nombre, ['borrador']);
    this.asegurarPropietario(pedido, empleadoId);

    await this.prisma.$transaction((tx) =>
      this.cerrarEstadoYAbrirUno(tx, id, estadoActual.estadoId, 'pendiente'),
    );

    return this.findOne(id);
  }

  async cancelar(id: number, empleadoId: number) {
    const { pedido, estadoActual } = await this.findConEstadoActual(id);
    this.asegurarEstadoPermitido(estadoActual.estado.nombre, ['borrador', 'pendiente']);
    this.asegurarPropietario(pedido, empleadoId);

    await this.prisma.$transaction((tx) =>
      this.cerrarEstadoYAbrirUno(tx, id, estadoActual.estadoId, 'cancelado'),
    );

    return this.findOne(id);
  }

  findAll() {
    return this.prisma.pedido.findMany({ include: PEDIDO_INCLUDE, orderBy: { id: 'desc' } });
  }

  async findOne(id: number) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: PEDIDO_INCLUDE });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  private asegurarPropietario(pedido: { empleadoId: number }, empleadoId: number) {
    if (pedido.empleadoId !== empleadoId) {
      throw new BadRequestException('Solo el vendedor que generó el pedido puede modificarlo');
    }
  }
}