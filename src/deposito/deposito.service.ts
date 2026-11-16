import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepositoDto } from './dto/create-deposito.dto';
import { UpdateDepositoDto } from './dto/update-deposito.dto';

// ============================================================
// DepositoService — CRUD para la tabla Deposito.
//
// Sigue el mismo patrón que EmpleadoService:
//   - SELECT constante para no filtrar campos internos accidentalmente.
//   - validarUnicos antes de create/update.
//   - findOne lanza NotFoundException si no existe.
//   - remove hace soft-delete (activo=false + deletedAt=now) en vez de
//     borrar la fila — preserva integridad referencial con PlanRuta.
// ============================================================

const DEPOSITO_SELECT = {
  id: true,
  nombre: true,
  direccion: true,
  latitud: true,
  longitud: true,
  horaApertura: true,
  horaCierre: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class DepositoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica que no exista otro depósito con el mismo nombre.
   * excludeId se usa en update para excluir el propio registro.
   */
  private async validarUnicoNombre(nombre: string, excludeId?: number) {
    const existing = await this.prisma.deposito.findUnique({
      where: { nombre },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Ya existe un depósito con ese nombre');
    }
  }

  async create(dto: CreateDepositoDto) {
    await this.validarUnicoNombre(dto.nombre);

    return this.prisma.deposito.create({
      data: {
        nombre: dto.nombre,
        direccion: dto.direccion,
        latitud: dto.latitud,
        longitud: dto.longitud,
        horaApertura: dto.horaApertura,
        horaCierre: dto.horaCierre,
        activo: dto.activo ?? true,
      },
      select: DEPOSITO_SELECT,
    });
  }

  findAll() {
    return this.prisma.deposito.findMany({
      where: { deletedAt: null },
      select: DEPOSITO_SELECT,
      orderBy: [{ nombre: 'asc' }],
    });
  }

  /**
   * Sólo devuelve depósitos activos. Útil para el dropdown de
   * selección en el frontend al crear un PlanRuta.
   */
  findActivos() {
    return this.prisma.deposito.findMany({
      where: { activo: true, deletedAt: null },
      select: DEPOSITO_SELECT,
      orderBy: [{ nombre: 'asc' }],
    });
  }

  async findOne(id: number) {
    const deposito = await this.prisma.deposito.findUnique({
      where: { id },
      select: DEPOSITO_SELECT,
    });
    if (!deposito) {
      throw new NotFoundException('Depósito no encontrado');
    }
    return deposito;
  }

  async update(id: number, dto: UpdateDepositoDto) {
    await this.findOne(id); // lanza NotFoundException si no existe

    if (dto.nombre !== undefined) {
      await this.validarUnicoNombre(dto.nombre, id);
    }

    return this.prisma.deposito.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.latitud !== undefined && { latitud: dto.latitud }),
        ...(dto.longitud !== undefined && { longitud: dto.longitud }),
        ...(dto.horaApertura !== undefined && { horaApertura: dto.horaApertura }),
        ...(dto.horaCierre !== undefined && { horaCierre: dto.horaCierre }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
        updatedAt: new Date(),
      },
      select: DEPOSITO_SELECT,
    });
  }

  /**
   * Soft delete: marca activo=false y setea deletedAt.
   * No borra la fila para preservar integridad referencial con PlanRuta.
   *
   * Si el depósito está referenciado por PlanRutas activas, NO se permite
   * la baja — el caller debe reasignar esos PlanRutas antes.
   */
  async remove(id: number) {
    await this.findOne(id);

    // Validar que no haya PlanRutas que referencien este depósito
    const planRutasActivas = await this.prisma.planRuta.count({
      where: {
        depositoId: id,
        estado: { notIn: ['FINALIZADO', 'CANCELADO'] },
      },
    });
    if (planRutasActivas > 0) {
      throw new BadRequestException(
        `No se puede dar de baja el depósito: hay ${planRutasActivas} ` +
          `plan(es) de ruta activo(s) que lo referencian.`,
      );
    }

    await this.prisma.deposito.update({
      where: { id },
      data: { activo: false, deletedAt: new Date() },
    });

    return { message: 'Depósito dado de baja' };
  }
}
