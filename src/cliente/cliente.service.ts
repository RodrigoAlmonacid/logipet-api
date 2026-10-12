import {
  BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import * as bcrypt from 'bcrypt';

// Nunca devolvemos `pass`
const CLIENTE_SELECT = {
  id: true,
  nombre: true,
  apellido: true,
  comercio: true,
  telefono: true,
  email: true,
  horaAbreMat: true,
  horaCierreMat: true,
  horaAbreVesp: true,
  horaCierreVesp: true,
  direccion: true,
  latitud: true,
  longitud: true,
  activo: true,
} as const;

@Injectable()
export class ClienteService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarUnicos(email?: string, excludeId?: number) {
    if (email) {
      const cli = await this.prisma.cliente.findUnique({ where: { email } });
      if (cli && cli.id !== excludeId) throw new ConflictException('El email ya se encuentra registrado');
    }
  }

  async create(dto: CreateClienteDto) {
    const { email, nombre, apellido, comercio, telefono, direccion, latitud, longitud, horaAbreMat, horaAbreVesp, horaCierreMat, horaCierreVesp } = dto;
    await this.validarUnicos(email);

    const cliente = await this.prisma.cliente.create({
      data: { nombre, apellido, comercio, email, telefono, direccion, latitud, longitud, horaAbreMat, horaAbreVesp, horaCierreMat, horaCierreVesp, createdAt: new Date() },
      select: CLIENTE_SELECT,
    });

    return { message: 'Cliente creado exitosamente', cliente };
  }

  findAll() {
    return this.prisma.cliente.findMany({
      where: { deletedAt: null },
      select: CLIENTE_SELECT,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }, { comercio: 'asc' }],
    });
  }

  async findOne(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      select: CLIENTE_SELECT,
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente  ;
  }

  async update(id: number, dto: UpdateClienteDto) {
    await this.findOne(id);
    const { ...data } = dto;
    await this.validarUnicos(data.email, id);

    return this.prisma.cliente.update({
      where: { id },
      data: {
        ...data, updatedAt: new Date()
      },
      select: CLIENTE_SELECT,
    });
  }

  // Baja lógica
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.cliente.update({ where: { id }, data: { activo: false, deletedAt: new Date() } });
    return { message: 'Cliente dado de baja' };
  }

}