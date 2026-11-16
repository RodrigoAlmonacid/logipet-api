import { Module } from '@nestjs/common';
import { DepositoController } from './deposito.controller';
import { DepositoService } from './deposito.service';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// DepositoModule — feature module siguiendo el patrón de
// EmpleadoModule:
//   - PrismaService se declara en `providers` directamente
//     (sin importar un PrismaModule compartido).
//   - DepositoService se exporta para que PlanRutaModule
//     (Batch 4b) pueda importar este módulo y usarlo.
//
// Si en el futuro centralizás PrismaService en un PrismaModule
// global (@Global @Module({ providers: [PrismaService], exports: [PrismaService] })),
// sacá la línea de PrismaService de acá y del resto de los módulos
// para evitar instancias duplicadas del PrismaClient.
// ============================================================

@Module({
  controllers: [DepositoController],
  providers: [DepositoService, PrismaService],
  exports: [DepositoService],
})
export class DepositoModule {}
