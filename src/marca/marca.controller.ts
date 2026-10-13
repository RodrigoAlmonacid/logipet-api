import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import { MarcaService } from './marca.service';

@Controller('marcas')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class MarcaController {
  constructor(private readonly marcaService: MarcaService) {}

  @Post()
  @RequirePermissions(PERMISOS.MARCA_CREATE)
  create(@Body() dto: CreateMarcaDto) { return this.marcaService.create(dto); }

  @Get()
  @RequirePermissions(PERMISOS.MARCA_VIEW)
  findAll() { return this.marcaService.findAll(); }

  @Get(':id')
  @RequirePermissions(PERMISOS.MARCA_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.marcaService.findOne(id); }

  @Patch(':id')
  @RequirePermissions(PERMISOS.MARCA_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMarcaDto) { return this.marcaService.update(id, dto); }

  @Delete(':id')
  @RequirePermissions(PERMISOS.MARCA_DELETE)
  remove(@Param('id', ParseIntPipe) id: number) { return this.marcaService.remove(id); }
}