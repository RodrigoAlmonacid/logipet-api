import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from './../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { ComercioService } from './comercio.service';
import { CreateComercioDto } from './dto/create-comercio.dto';
import { UpdateComercioDto } from './dto/update-comercio.dto';

@Controller('comercios')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class ComercioController {
  constructor(private readonly comercioService: ComercioService) {}

  @Post()
  @RequirePermissions(PERMISOS.COMERCIO_CREATE)
  create(@Body() dto: CreateComercioDto) {
    return this.comercioService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISOS.COMERCIO_VIEW)
  findAll(@Query('clienteId') clienteId?: string) {
    const id = clienteId === undefined ? undefined : Number(clienteId);
    if (id !== undefined && !Number.isInteger(id)) {
      throw new BadRequestException('clienteId inválido');
    }
    return this.comercioService.findAll(id);
  }

  @Get(':id')
  @RequirePermissions(PERMISOS.COMERCIO_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.comercioService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISOS.COMERCIO_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateComercioDto) {
    return this.comercioService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISOS.COMERCIO_DELETE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.comercioService.remove(id);
  }
}