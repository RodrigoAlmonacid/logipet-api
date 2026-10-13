import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermisoService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permiso.findMany({ orderBy: { codigo: 'asc' } });
  }
}