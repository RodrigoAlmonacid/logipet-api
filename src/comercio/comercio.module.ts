import { Module } from '@nestjs/common';
import { ComercioController } from './comercio.controller';
import { ComercioService } from './comercio.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  // imports: [PrismaModule],
  controllers: [ComercioController],
  providers: [ComercioService, PrismaService,],
  exports: [ComercioService],
})
export class ComercioModule {}