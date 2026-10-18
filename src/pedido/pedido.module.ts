import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PedidoController } from './pedido.controller';
import { PedidoService } from './pedido.service';
import { PresupuestoPdfService } from './presupuesto-pdf.service';

@Module({
  controllers: [PedidoController],
  providers: [PedidoService, PresupuestoPdfService, PrismaService],
})
export class PedidoModule {}