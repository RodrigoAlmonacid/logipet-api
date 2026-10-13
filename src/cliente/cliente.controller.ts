import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClienteService } from './cliente.service';

@Controller('clientes')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class ClienteController {
  constructor(private readonly clientesService: ClienteService) {}

  @Post()
  @RequirePermissions(PERMISOS.CLIENTE_CREATE)
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISOS.CLIENTE_VIEW)
  findAll() {
    return this.clientesService.findAll();
  }
  
  @Get(':id')
  @RequirePermissions(PERMISOS.CLIENTE_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISOS.CLIENTE_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISOS.CLIENTE_DELETE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.remove(id);
  }
}