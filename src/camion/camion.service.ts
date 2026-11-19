import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCamionDto, UpdateCamionDto } from './dto/camion.dto';

const ESTADOS_PLAN_ACTIVOS = ['PENDIENTE', 'OPTIMIZADO', 'EN_PROCESO'];

@Injectable()
export class CamionService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.camion.findMany({
      where: { deletedAt: null },
      orderBy: { interno: 'asc' },
    });
  }

  obtener(id: number) {
    return this.buscar(id);
  }

  crear(dto: CreateCamionDto) {
    return this.guardar(() => this.prisma.camion.create({ data: dto }));
  }

  async actualizar(id: number, dto: UpdateCamionDto) {
    await this.buscar(id);
    return this.guardar(() => this.prisma.camion.update({ where: { id }, data: dto }));
  }

  async eliminar(id: number) {
    await this.buscar(id);
    const enPlan = await this.prisma.planRuta.count({
      where: { estado: { in: ESTADOS_PLAN_ACTIVOS }, camiones: { some: { id } } },
    });
    if (enPlan > 0) {
      throw new ConflictException('El camión está asignado a un plan de ruta activo.');
    }
    // Baja lógica: los envíos históricos siguen apuntando al camión.
    await this.prisma.camion.update({
      where: { id },
      data: { deletedAt: new Date(), disponible: false },
    });
  }

  private async buscar(id: number) {
    const camion = await this.prisma.camion.findFirst({ where: { id, deletedAt: null } });
    if (!camion) throw new NotFoundException(`No existe el camión ${id}.`);
    return camion;
  }

  /** Traduce el error de unique (interno repetido) a un 409 legible. */
  private async guardar<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un camión con ese número de interno.');
      }
      throw e;
    }
  }
}