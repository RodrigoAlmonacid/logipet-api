import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AlicuotaIvaService } from './alicuotaIva.service';

@Controller('alicuota-iva')
@UseGuards(AuthGuard('jwt'))
export class AlicuotaIvaController {
  constructor(private readonly alicuotaIvaService: AlicuotaIvaService) {}

  @Get() findAll() { return this.alicuotaIvaService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.alicuotaIvaService.findOne(id); }
}