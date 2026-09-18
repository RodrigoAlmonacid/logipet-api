import { Module } from '@nestjs/common';
import { EmpleadoService } from './empleado.service';
import { EmpleadoController } from './empleado.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [EmpleadoController],
  providers: [EmpleadoService, PrismaService],
})
export class EmpleadoModule {}