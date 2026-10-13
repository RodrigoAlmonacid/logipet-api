import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

export const ROLES_PROTEGIDOS = ['superadmin'];

const ROL_INCLUDE = { permisos: true } as const;

@Injectable()
export class RolService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarPermisos(permisoIds?: number[]) {
    if (!permisoIds?.length) return;
    const cantidad = await this.prisma.permiso.count({ where: { id: { in: permisoIds } } });
    if (cantidad !== new Set(permisoIds).size) {
      throw new BadRequestException('Alguno de los permisos indicados no existe');
    }
  }

  async create(dto: CreateRolDto) {
    const { permisoIds, ...data } = dto;

    const existe = await this.prisma.rol.findUnique({ where: { nombre: data.nombre } });
    if (existe) throw new ConflictException('Ya existe un rol con ese nombre');

    await this.validarPermisos(permisoIds);

    const rol = await this.prisma.rol.create({
      data: {
        ...data,
        ...(permisoIds && { permisos: { connect: permisoIds.map((id) => ({ id })) } }),
      },
      include: ROL_INCLUDE,
    });

    return { message: 'Rol creado exitosamente', rol };
  }

  findAll() {
    return this.prisma.rol.findMany({ orderBy: { nombre: 'asc' }, include: ROL_INCLUDE });
  }

  async findOne(id: number) {
    const rol = await this.prisma.rol.findUnique({ where: { id }, include: ROL_INCLUDE });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  async update(id: number, dto: UpdateRolDto) {
    const rol = await this.findOne(id);
    const { permisoIds, ...data } = dto;

    if (data.nombre && data.nombre !== rol.nombre) {
      if (ROLES_PROTEGIDOS.includes(rol.nombre)) {
        throw new BadRequestException('Este rol del sistema no se puede renombrar');
      }
      const existe = await this.prisma.rol.findUnique({ where: { nombre: data.nombre } });
      if (existe) throw new ConflictException('Ya existe un rol con ese nombre');
    }

    if (permisoIds && ROLES_PROTEGIDOS.includes(rol.nombre)) {
      throw new BadRequestException('Los permisos del rol superadmin no se pueden modificar');
    }

    await this.validarPermisos(permisoIds);

    return this.prisma.rol.update({
      where: { id },
      data: {
        ...data,
        ...(permisoIds && { permisos: { set: permisoIds.map((pid) => ({ id: pid })) } }),
      },
      include: ROL_INCLUDE,
    });
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