import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AlicuotaIvaService } from './alicuotaIva.service';

@Controller('alicuota-iva')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AlicuotaIvaController {
  constructor(private readonly alicuotaIvaService: AlicuotaIvaService) {}

  @Get() findAll() { return this.alicuotaIvaService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.alicuotaIvaService.findOne(id); }
}