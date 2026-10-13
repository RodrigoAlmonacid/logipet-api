import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';
import { ArticuloService } from './articulo.service';
import { PERMISOS } from '../utils/permisos.constants';

@Controller('articulos')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class ArticuloController {
  constructor(private readonly articuloService: ArticuloService) { }

  @Post()
  @RequirePermissions(PERMISOS.ARTICULO_CREATE)
  create(@Body() dto: CreateArticuloDto) { return this.articuloService.create(dto); }

  @Get()
  @RequirePermissions(PERMISOS.ARTICULO_VIEW)
  findAll() { return this.articuloService.findAll(); }

  @Get(':id')
  @RequirePermissions(PERMISOS.ARTICULO_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.articuloService.findOne(id); }

  @Patch(':id')
  @RequirePermissions(PERMISOS.ARTICULO_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateArticuloDto) { return this.articuloService.update(id, dto); }

  @Delete(':id')
  @RequirePermissions(PERMISOS.ARTICULO_DELETE)
  remove(@Param('id', ParseIntPipe) id: number) { return this.articuloService.remove(id); }

}