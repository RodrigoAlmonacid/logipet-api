// permiso/permiso.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermisoController } from './permiso.controller';
import { PermisoService } from './permiso.service';

@Module({
  controllers: [PermisoController],
  providers: [PermisoService, PrismaService],
})
export class PermisoModule {}