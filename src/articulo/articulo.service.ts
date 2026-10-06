import {
  BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';

const ARTICULO_SELECT = {
  id: true,
  codigo: true,
  precio: true,
  presentacion: true,
  descripcion: true,
  nombre: true,
  stock: true,
  marca: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class ArticuloService {
  constructor(private readonly prisma: PrismaService) { }

  private async validarUnicos(codigo?: string) {
    if (codigo) {
      const cod = await this.prisma.articulo.findUnique({ where: { codigo } });
      if (cod && cod.codigo !== codigo) throw new ConflictException('El código ya se encuentra registrado');
    }
  }

  async create(dto: CreateArticuloDto) {
    const { codigo, precio, presentacion, descripcion, nombre, stock, marcaId } = dto;
    await this.validarUnicos(codigo);

    const articulo = await this.prisma.articulo.create({
      data: { codigo, precio, presentacion, descripcion, nombre, stock, marcaId, createdAt: new Date() },
      select: ARTICULO_SELECT,
    });

    return { message: 'Articulo creado exitosamente', articulo };
  }

  findAll() {
    return this.prisma.articulo.findMany({
      where: { deletedAt: null },
      select: ARTICULO_SELECT,
      orderBy: [{ nombre: 'asc' }, { marcaId: 'asc' }],
    });
  }

  async findOne(id: number) {
    const articulo = await this.prisma.articulo.findUnique({
      where: { id },
      select: ARTICULO_SELECT,
    });
    if (!articulo) throw new NotFoundException('Articulo no encontrado');
    return articulo;
  }

  async update(id: number, dto: UpdateArticuloDto) {
    await this.findOne(id);
    const { ...data } = dto;
    await this.validarUnicos(data.codigo);

    return this.prisma.articulo.update({
      where: { id },
      data: {
        ...data, updatedAt: new Date()
      },
      select: ARTICULO_SELECT,
    });
  }

  // Baja lógica
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.articulo.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Articulo dado de baja' };
  }

}