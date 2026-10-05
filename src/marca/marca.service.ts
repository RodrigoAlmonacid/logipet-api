import {
  BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import * as bcrypt from 'bcrypt';

// Nunca devolvemos `pass`
const MARCA_SELECT = {
  id: true,
  nombre: true,
} as const;

@Injectable()
export class MarcaService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarUnicos(nombre?: string,) {
    if (nombre) {
      const nom = await this.prisma.marca.findUnique({ where: { nombre } });
      if (nom && nom.nombre !== nombre) throw new ConflictException('La marca ya se encuentra registrada');
    }
  }

  async create(dto: CreateMarcaDto) {
    const { nombre } = dto;
    await this.validarUnicos(nombre);

    const marca = await this.prisma.marca.create({
      data: { nombre, createdAt: new Date() },
      select: MARCA_SELECT,
    });

    return { message: 'Marca creada exitosamente', marca };
  }

  findAll() {
    return this.prisma.marca.findMany({
      select: MARCA_SELECT,
      orderBy: [{ nombre: 'asc' }],
    });
  }

  async findOne(id: number) {
    const marca = await this.prisma.marca.findUnique({
      where: { id },
      select: MARCA_SELECT,
    });
    if (!marca) throw new NotFoundException('Marca no encontrada');
    return marca;
  }

  async update(id: number, dto: UpdateMarcaDto) {
    await this.findOne(id);
    const { ...data } = dto;
    await this.validarUnicos( data.nombre );

    return this.prisma.marca.update({
      where: { id },
      data: {
        ...data, updatedAt: new Date(),
      },
      select: MARCA_SELECT,
    });
  }

  // Baja lógica
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.marca.update({ where: { id }, data: {  deletedAt: new Date() } });
    return { message: 'Marca dada de baja' };
  }

}