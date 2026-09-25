import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolController } from './rol.controller';
import { RolService } from './rol.service';

@Module({
  controllers: [RolController],
  providers: [RolService, PrismaService],
})
export class RolModule {}