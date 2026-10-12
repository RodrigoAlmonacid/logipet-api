import { Module } from '@nestjs/common';
import { AlicuotaIvaService } from './alicuotaIva.service';
import { AlicuotaIvaController } from './alicuotaIva.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AlicuotaIvaController],
  providers: [AlicuotaIvaService, PrismaService],
})
export class AlicuotaIvaModule {}