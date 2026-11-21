import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { MailService } from './../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { AuthUser } from '../auth/auth-user';
import { PERMISOS } from '../utils/permisos.constants';

// Roles que solo puede dar o quitar quien administra roles (rol:manage): si no, un empleado con
// permiso de edición podría asignarse (o asignar a un cómplice) más poder del que tiene.
const ROLES_RESERVADOS = ['superadmin', 'administracion'];

// Nunca devolvemos `pass`
const EMPLEADO_SELECT = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  legajo: true,
  cuil: true,
  activo: true,
  roles: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class EmpleadoService {
  constructor(
    private readonly prisma: PrismaService, 
    private readonly mailService: MailService
  ) { }

  private async validarUnicos(email?: string, legajo?: string, cuil?: string, excludeId?: number) {
    if (email) {
      const e = await this.prisma.empleado.findUnique({ where: { email } });
      if (e && e.id !== excludeId) throw new ConflictException('El email ya se encuentra registrado');
    }
    if (legajo) {
      const l = await this.prisma.empleado.findUnique({ where: { legajo } });
      if (l && l.id !== excludeId) throw new ConflictException('El legajo ya se encuentra registrado');
    }
    if (cuil) {
      const c = await this.prisma.empleado.findUnique({ where: { cuil } });
      if (c && c.id !== excludeId) throw new ConflictException('El cuil ya se encuentra registrado');
    }
  }

  async create(dto: CreateEmpleadoDto) {
    const { email, nombre, apellido, legajo, cuil } = dto;
    await this.validarUnicos(email, legajo, cuil);

    const tempPassword = 'Logipet' + '-' + legajo;
    const pass = await bcrypt.hash(tempPassword, 10);

    const empleado = await this.prisma.empleado.create({
      data: { nombre, apellido, email, legajo, cuil, pass, createdAt: new Date() },
      select: EMPLEADO_SELECT,
    });

    const loginLink = `${process.env.FRONT_URL}/login`;
    await this.mailService.send(
      empleado.email,
      'Alta de empleado - LogiPet',
      `
        <p>Hola ${empleado.nombre},</p>
        <p>Bienvenido a LogiPet.</p>
        <p>Tu cuenta ha sido creada. Ingresá a tu cuenta con tu legajo y esta contraseña temporal:</p>
        <p><strong>${tempPassword}</strong></p>
        <p><a href="${loginLink}">Ingresar a mi cuenta</a></p>
        <p>Te recomendamos cambiar tu contraseña una vez que ingreses.</p>
      `,
    );

    // TODO: enviar tempPassword por mail
    return { message: 'Empleado creado exitosamente', empleado, tempPassword };
  }

  async passReset(id: number, newPass: string) {
    await this.findOne(id);

    try {
      const hashPass = await bcrypt.hash(newPass, 10);

      const empleadoActualizado = await this.prisma.empleado.update({
        where: { id },
        data: { pass: hashPass, updateAt: new Date() },
        select: EMPLEADO_SELECT,
      });

      return {
        message: 'Contraseña actualizada exitosamente',
        empleado: empleadoActualizado
      };

    } catch (error) {
      throw new InternalServerErrorException('Ocurrió un error al intentar actualizar la contraseña');
    }
  }

  findAll() {
    return this.prisma.empleado.findMany({
      where: { deletedAt: null },
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

  private puedeAdministrarRoles(actor: AuthUser) {
    return actor.permisos.includes(PERMISOS.ROL_MANAGE);
  }

  /** Un superadmin solo puede ser modificado o dado de baja por alguien que administra roles. */
  private async asegurarPuedeTocar(id: number, actor: AuthUser) {
    const objetivo = await this.prisma.empleado.findUnique({ where: { id }, select: { roles: { select: { nombre: true } } } });
    if (objetivo?.roles.some((r) => r.nombre === 'superadmin') && !this.puedeAdministrarRoles(actor)) {
      throw new ForbiddenException('Solo un superadmin puede modificar a otro superadmin');
    }
  }

  /** No se puede desactivar a quien está en la calle con una hoja de ruta despachada (con pedidos en ruta). */
  private async asegurarSinHojaEnCurso(id: number) {
    const enCalle = await this.prisma.envio.count({
      where: {
        empleados: { some: { id } },
        planRuta: { estado: 'DESPACHADO' },
        pedidos: { some: { historialEstados: { some: { fechaFin: null, estado: { nombre: 'en_ruta' } } } } },
      },
    });
    if (enCalle > 0) {
      throw new ConflictException('El empleado está en una hoja de ruta en reparto. Esperá a que termine las entregas.');
    }
  }

  /** Cambios de roles: los reservados (superadmin, administracion) requieren rol:manage. */
  private async validarCambioDeRoles(id: number, roleIds: number[], actor: AuthUser) {
    const nuevos = new Set(roleIds);
    const cantidad = await this.prisma.rol.count({ where: { id: { in: [...nuevos] } } });
    if (cantidad !== nuevos.size) throw new BadRequestException('Alguno de los roles indicados no existe');
    if (this.puedeAdministrarRoles(actor)) return;

    const actuales = await this.prisma.rol.findMany({ where: { empleados: { some: { id } } }, select: { id: true } });
    const antes = new Set(actuales.map((r) => r.id));
    const cambiados = [...nuevos].filter((r) => !antes.has(r)).concat([...antes].filter((r) => !nuevos.has(r)));
    if (cambiados.length === 0) return;
    const reservados = await this.prisma.rol.count({ where: { id: { in: cambiados }, nombre: { in: ROLES_RESERVADOS } } });
    if (reservados > 0) {
      throw new ForbiddenException('Solo quien administra roles puede asignar o quitar los roles superadmin y administracion');
    }
  }

  async update(id: number, dto: UpdateEmpleadoDto, actor: AuthUser) {
    await this.findOne(id);
    await this.asegurarPuedeTocar(id, actor);
    const { roleIds, ...data } = dto;
    await this.validarUnicos(data.email, data.legajo, data.cuil, id);

    if (data.activo === false) {
      if (id === actor.id) throw new BadRequestException('No podés desactivar tu propio usuario');
      await this.asegurarSinHojaEnCurso(id);
    }
    if (roleIds) await this.validarCambioDeRoles(id, roleIds, actor);

    return this.prisma.empleado.update({
      where: { id },
      data: {
        ...data, updatedAt: new Date(),
        ...(roleIds && { roles: { set: roleIds.map((rid) => ({ id: rid })) } }),
      },
      select: EMPLEADO_SELECT,
    });
  }

  // Baja lógica
  async remove(id: number, actor: AuthUser) {
    if (id === actor.id) {
      throw new BadRequestException('No podés dar de baja tu propio usuario');
    }
    await this.findOne(id);
    await this.asegurarPuedeTocar(id, actor);
    await this.asegurarSinHojaEnCurso(id);
    await this.prisma.empleado.update({ where: { id }, data: { activo: false, deletedAt: new Date() } });
    return { message: 'Empleado dado de baja' };
  }

}
