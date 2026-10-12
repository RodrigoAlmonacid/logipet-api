import { Module } from '@nestjs/common';
import { ClienteService } from './cliente.service';
import { ClienteController } from './cliente.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MailModule } from '../mail/mail.module';

@Module({
  controllers: [ClienteController],
  providers: [ClienteService, PrismaService, MailModule],
})
export class ClienteModule {}