import {
  Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ALICUOTA_IVA_SELECT = {
  id: true,
  porcentaje: true,
  descripcion: true,
} as const;

@Injectable()
export class AlicuotaIvaService {
  constructor(private readonly prisma: PrismaService) { }

  findAll() {
    return this.prisma.alicuotaIva.findMany({
      select: ALICUOTA_IVA_SELECT,
      orderBy: { porcentaje: 'asc' },
    });
  }

  async findOne(id: number) {
    const alicuotaIva = await this.prisma.alicuotaIva.findFirst({
      where: { id },
      select: ALICUOTA_IVA_SELECT,
    });
    if (!alicuotaIva) throw new NotFoundException('Alicuota de IVA no encontrada');
    return alicuotaIva;
  }
}