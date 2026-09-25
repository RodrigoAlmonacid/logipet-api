import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import * as bcrypt from 'bcrypt';

// Nunca devolvemos `pass`
const EMPLEADO_SELECT = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  legajo: true,
  activo: true,
  roles: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class EmpleadoService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarUnicos(email?: string, legajo?: string, excludeId?: number) {
    if (email) {
      const e = await this.prisma.empleado.findUnique({ where: { email } });
      if (e && e.id !== excludeId) throw new ConflictException('El email ya se encuentra registrado');
    }
    if (legajo) {
      const l = await this.prisma.empleado.findUnique({ where: { legajo } });
      if (l && l.id !== excludeId) throw new ConflictException('El legajo ya se encuentra registrado');
    }
  }

  async create(dto: CreateEmpleadoDto) {
    const { email, nombre, apellido, legajo } = dto;
    await this.validarUnicos(email, legajo);

    const tempPassword = 'Logipet' + Math.floor(1000 + Math.random() * 9000);
    const pass = await bcrypt.hash(tempPassword, 10);

    const empleado = await this.prisma.empleado.create({
      data: { nombre, apellido, email, legajo, pass },
      select: EMPLEADO_SELECT,
    });

    // TODO: enviar tempPassword por mail
    return { message: 'Empleado creado exitosamente', empleado, tempPassword };
  }

  findAll() {
    return this.prisma.empleado.findMany({
      select: EMPLEADO_SELECT,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: number) {
    const empleado = await this.prisma.empleado.findUnique({
      where: { id },
      select: EMPLEADO_SELECT,
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return empleado;
  }

  async update(id: number, dto: UpdateEmpleadoDto) {
    await this.findOne(id);
    const { roleIds, ...data } = dto;
    await this.validarUnicos(data.email, data.legajo, id);

    if (roleIds) {
      const cantidad = await this.prisma.rol.count({ where: { id: { in: roleIds } } });
      if (cantidad !== new Set(roleIds).size) {
        throw new BadRequestException('Alguno de los roles indicados no existe');
      }
    }

    return this.prisma.empleado.update({
      where: { id },
      data: {
        ...data,
        ...(roleIds && { roles: { set: roleIds.map((rid) => ({ id: rid })) } }),
      },
      select: EMPLEADO_SELECT,
    });
  }

  // Baja lógica
  async remove(id: number, currentUserId: number) {
    if (id === currentUserId) {
      throw new BadRequestException('No podés dar de baja tu propio usuario');
    }
    await this.findOne(id);
    await this.prisma.empleado.update({ where: { id }, data: { activo: false } });
    return { message: 'Empleado dado de baja' };
  }

}