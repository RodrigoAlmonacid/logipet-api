import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalisisIaService } from './analisis-ia.service';
import { ReabastecimientoController } from './reabastecimiento.controller';
import { ReabastecimientoService } from './reabastecimiento.service';

@Module({
  controllers: [ReabastecimientoController],
  providers: [ReabastecimientoService, AnalisisIaService, PrismaService],
})
export class ReabastecimientoModule {}
