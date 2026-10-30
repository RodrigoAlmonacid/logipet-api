import {
  BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

// Nunca devolvemos `pass`
const CLIENTE_SELECT = {
  id: true,
  nombre: true,
  apellido: true,
  comercio: true,
  telefono: true,
  email: true,
  cuit: true,
  condicionIva: true,
  horaAbreMat: true,
  horaCierreMat: true,
  horaAbreVesp: true,
  horaCierreVesp: true,
  direccion: true,
  latitud: true,
  longitud: true,
  activo: true,
} as const;

const INCLUDE_COMERCIOS = { comercios: { orderBy: { id: 'asc' as const } } };

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
  const { comercio, ...datos } = dto;
    await this.validarUnicos(datos.email);

    const cliente = await this.prisma.cliente.create({
    data: { ...datos, comercios: { create: comercio } },
    include: INCLUDE_COMERCIOS,
  });

    return { message: 'Cliente creado exitosamente', cliente };
  }

  findAll() {
  return this.prisma.cliente.findMany({ include: INCLUDE_COMERCIOS, orderBy: { apellido: 'asc' } });
}

async findOne(id: number) {
  const cliente = await this.prisma.cliente.findUnique({ where: { id }, include: INCLUDE_COMERCIOS });
  if (!cliente) throw new NotFoundException('Cliente no encontrado');
  return cliente;
}

async update(id: number, dto: UpdateClienteDto) {
  await this.findOne(id);
  return this.prisma.cliente.update({ where: { id }, data: dto, include: INCLUDE_COMERCIOS });
}

  // Baja lógica
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.cliente.update({ where: { id }, data: { activo: false, deletedAt: new Date() } });
    return { message: 'Cliente dado de baja' };
  }

}