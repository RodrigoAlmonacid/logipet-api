import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

// Roles que el código referencia con @Roles(...): no se renombran ni se borran
const ROLES_PROTEGIDOS = ['adminUser'];

@Injectable()
export class RolService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRolDto) {
    const existe = await this.prisma.rol.findUnique({ where: { nombre: dto.nombre } });
    if (existe) throw new ConflictException('Ya existe un rol con ese nombre');
    return this.prisma.rol.create({ data: dto });
  }

  findAll() {
    return this.prisma.rol.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number) {
    const rol = await this.prisma.rol.findUnique({ where: { id } });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  async update(id: number, dto: UpdateRolDto) {
    const rol = await this.findOne(id);

    if (dto.nombre && dto.nombre !== rol.nombre) {
      if (ROLES_PROTEGIDOS.includes(rol.nombre)) {
        throw new BadRequestException('Este rol del sistema no se puede renombrar');
      }
      const existe = await this.prisma.rol.findUnique({ where: { nombre: dto.nombre } });
      if (existe) throw new ConflictException('Ya existe un rol con ese nombre');
    }

    return this.prisma.rol.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const rol = await this.findOne(id);

    if (ROLES_PROTEGIDOS.includes(rol.nombre)) {
      throw new BadRequestException('Este rol del sistema no se puede eliminar');
    }

    const asignados = await this.prisma.empleado.count({ where: { roles: { some: { id } } } });
    if (asignados > 0) {
      throw new ConflictException(`El rol está asignado a ${asignados} empleado(s)`);
    }

    await this.prisma.rol.delete({ where: { id } });
    return { message: 'Rol eliminado' };
  }
}