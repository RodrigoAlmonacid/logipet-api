import { Module } from '@nestjs/common';
import { PlanRutaController } from './plan-ruta.controller';
import { PlanRutaService } from './plan-ruta.service';
import { PrismaService } from '../prisma/prisma.service';
import { OsrmModule } from '../osrm/osrm.module';
import { DepositoModule } from '../deposito/deposito.module';
import { RoutingSolverService } from '../routing-solver/routing-solver.service';
import { PedidoModule } from '../pedido/pedido.module';

@Module({
  imports: [OsrmModule, DepositoModule, PedidoModule],
  controllers: [PlanRutaController],
  providers: [PlanRutaService, PrismaService, RoutingSolverService],
})
export class PlanRutaModule {}
