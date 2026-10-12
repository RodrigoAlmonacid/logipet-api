import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import { MarcaService } from './marca.service';

@Controller('marcas')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('adminUser') // ajustá si querés permitir más roles
export class MarcaController {
  constructor(private readonly marcaService: MarcaService) {}

  @Post() create(@Body() dto: CreateMarcaDto) { return this.marcaService.create(dto); }
  @Get() findAll() { return this.marcaService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.marcaService.findOne(id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMarcaDto) { return this.marcaService.update(id, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.marcaService.remove(id); }
}