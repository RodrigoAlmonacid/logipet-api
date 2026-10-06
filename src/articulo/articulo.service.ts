import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';

const ARTICULO_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  presentacion: true,
  descripcion: true,
  precio: true,
  stock: true,
  marcaId: true,
  marca: { select: { id: true, nombre: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ArticuloService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarCodigoUnico(codigo: string, excludeId?: number) {
    const existente = await this.prisma.articulo.findUnique({ where: { codigo } });
    if (existente && existente.id !== excludeId) {
      throw new ConflictException('Ya existe un artículo con ese código');
    }
  }

  private async validarMarca(marcaId?: number | null) {
    if (marcaId == null) return;
    const marca = await this.prisma.marca.findFirst({
      where: { id: marcaId, deletedAt: null },
      select: { id: true },
    });
    if (!marca) throw new NotFoundException('La marca indicada no existe');
  }

  async create(dto: CreateArticuloDto) {
    await this.validarCodigoUnico(dto.codigo);
    await this.validarMarca(dto.marcaId);

    const articulo = await this.prisma.articulo.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        presentacion: dto.presentacion,
        descripcion: dto.descripcion ?? null,
        precio: dto.precio,
        stock: dto.stock,
        marcaId: dto.marcaId ?? null,
      },
      select: ARTICULO_SELECT,
    });
    return { message: 'Artículo creado exitosamente', articulo };
  }

  findAll() {
    return this.prisma.articulo.findMany({
      where: { deletedAt: null },
      select: ARTICULO_SELECT,
      orderBy: [{ nombre: 'asc' }, { codigo: 'asc' }],
    });
  }

  async findOne(id: number) {
    const articulo = await this.prisma.articulo.findFirst({
      where: { id, deletedAt: null },
      select: ARTICULO_SELECT,
    });
    if (!articulo) throw new NotFoundException('Artículo no encontrado');
    return articulo;
  }

  async update(id: number, dto: UpdateArticuloDto) {
    await this.findOne(id);
    if (dto.codigo) await this.validarCodigoUnico(dto.codigo, id);
    if (dto.marcaId !== undefined) await this.validarMarca(dto.marcaId);

    return this.prisma.articulo.update({
      where: { id },
      data: {
        ...dto,
        descripcion: dto.descripcion === undefined ? undefined : (dto.descripcion ?? null),
      },
      select: ARTICULO_SELECT,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.articulo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Artículo eliminado' };
  }
}