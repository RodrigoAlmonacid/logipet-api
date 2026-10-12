import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';

const MARCA_SELECT = {
  id: true,
  nombre: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class MarcaService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarNombreUnico(nombre: string, excludeId?: number) {
    const existente = await this.prisma.marca.findUnique({ where: { nombre } });
    if (existente && existente.id !== excludeId) {
      throw new ConflictException('Ya existe una marca con ese nombre');
    }
  }

  async create(dto: CreateMarcaDto) {
    await this.validarNombreUnico(dto.nombre);
    const marca = await this.prisma.marca.create({
      data: { nombre: dto.nombre },
      select: MARCA_SELECT,
    });
    return { message: 'Marca creada exitosamente', marca };
  }

  findAll() {
    return this.prisma.marca.findMany({
      where: { deletedAt: null },
      select: MARCA_SELECT,
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number) {
    const marca = await this.prisma.marca.findFirst({
      where: { id, deletedAt: null },
      select: MARCA_SELECT,
    });
    if (!marca) throw new NotFoundException('Marca no encontrada');
    return marca;
  }

  async update(id: number, dto: UpdateMarcaDto) {
    await this.findOne(id);
    if (dto.nombre) await this.validarNombreUnico(dto.nombre, id);
    return this.prisma.marca.update({
      where: { id },
      data: { ...dto },
      select: MARCA_SELECT,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    // Opcional: bloquear si hay artículos activos que la referencian.
    const articulosActivos = await this.prisma.articulo.count({
      where: { marcaId: id, deletedAt: null },
    });
    if (articulosActivos > 0) {
      throw new ConflictException(
        `No se puede eliminar: hay ${articulosActivos} artículo(s) asociados.`,
      );
    }

    await this.prisma.marca.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Marca eliminada' };
  }
}