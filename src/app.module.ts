import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { EmpleadoModule } from './empleado/empleado.module';

@Module({
  imports: [AuthModule, EmpleadoModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}