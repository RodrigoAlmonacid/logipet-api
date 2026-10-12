import { Module } from '@nestjs/common';
import { ArticuloService } from './articulo.service';
import { ArticuloController } from './articulo.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ArticuloController],
  providers: [ArticuloService, PrismaService],
})
export class ArticuloModule {}