import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComercioDto } from './dto/create-comercio.dto';
import { UpdateComercioDto } from './dto/update-comercio.dto';

const ESTADOS_FINALES = ['entregado', 'cancelado', 'rechazado'];

@Injectable()
export class ComercioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateComercioDto) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.comercio.create({ data: dto });
  }

  findAll(clienteId?: number) {
    return this.prisma.comercio.findMany({
      where: clienteId ? { clienteId } : {},
      orderBy: { id: 'asc' }, // el primero es el "por defecto"
    });
  }

  async findOne(id: number) {
    const comercio = await this.prisma.comercio.findUnique({ where: { id } });
    if (!comercio) throw new NotFoundException('Comercio no encontrado');
    return comercio;
  }

  async update(id: number, dto: UpdateComercioDto) {
    await this.findOne(id);
    return this.prisma.comercio.update({ where: { id }, data: dto });
  }

  // baja lógica: no se puede dar de baja un punto con pedidos en curso
  async remove(id: number) {
    await this.findOne(id);

    const enCurso = await this.prisma.pedido.count({
      where: {
        comercioId: id,
        historialEstados: {
          some: { fechaFin: null, estado: { nombre: { notIn: ESTADOS_FINALES } } },
        },
      },
    });
    if (enCurso > 0) {
      throw new BadRequestException(`El comercio tiene ${enCurso} pedido(s) en curso`);
    }

    return this.prisma.comercio.update({ where: { id }, data: { activo: false } });
  }
}