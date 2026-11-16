import { Module } from '@nestjs/common';
import { PlanRutaController } from './plan-ruta.controller';
import { PlanRutaService } from './plan-ruta.service';
import { PrismaService } from '../prisma/prisma.service';
import { OsrmModule } from '../osrm/osrm.module';
import { DepositoModule } from '../deposito/deposito.module';
import { RoutingSolverService } from '../routing-solver/routing-solver.service';

// ============================================================
// PlanRutaModule — feature module que importa OsrmModule y
// DepositoModule para tener acceso a sus servicios.
//
// Provee RoutingSolverService (wrapper @Injectable alrededor de
// la función pura solve()) para que PlanRutaService pueda
// mockearlo en tests vía DI estándar de NestJS.
//
// No exporta PlanRutaService — no hay otros módulos que deban
// usarlo directamente. El controller es lo único expuesto.
// ============================================================

@Module({
  imports: [OsrmModule, DepositoModule],
  controllers: [PlanRutaController],
  providers: [PlanRutaService, PrismaService, RoutingSolverService],
})
export class PlanRutaModule {}
