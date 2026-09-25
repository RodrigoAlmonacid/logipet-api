import { Module } from '@nestjs/common';
import { EmpleadoService } from './empleado.service';
import { EmpleadoController } from './empleado.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MailModule } from '../mail/mail.module';

@Module({
  controllers: [EmpleadoController],
  providers: [EmpleadoService, PrismaService, MailModule],
})
export class EmpleadoModule {}