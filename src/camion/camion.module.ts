import { Module } from '@nestjs/common';
import { CamionService } from './camion.service';
import { CamionController } from './camion.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MailModule } from '../mail/mail.module';

@Module({
  controllers: [CamionController],
  providers: [CamionService, PrismaService, MailModule],
})
export class CamionModule {}