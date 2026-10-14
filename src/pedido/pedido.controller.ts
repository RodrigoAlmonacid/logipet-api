import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from './../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { PedidoService } from './pedido.service';
import { PERMISOS } from '../utils/permisos.constants';

@Controller('pedidos')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PedidoController {
  constructor(private readonly pedidoService: PedidoService) {}

  @Post()
  @RequirePermissions(PERMISOS.PEDIDO_CREATE)
  create(@Body() dto: CreatePedidoDto, @Req() req: { user: { id: number } }) {
    return this.pedidoService.create(dto, req.user.id);
  }

  @Get()
  @RequirePermissions(PERMISOS.PEDIDO_VIEW)
  findAll() {
    return this.pedidoService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISOS.PEDIDO_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pedidoService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISOS.PEDIDO_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePedidoDto, @Req() req: { user: { id: number } }) {
    return this.pedidoService.update(id, dto, req.user.id);
  }

  @Patch(':id/confirmar')
  @RequirePermissions(PERMISOS.PEDIDO_CONFIRM)
  confirmar(@Param('id', ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.pedidoService.confirmar(id, req.user.id);
  }

  @Patch(':id/cancelar')
  @RequirePermissions(PERMISOS.PEDIDO_CANCEL)
  cancelar(@Param('id', ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.pedidoService.cancelar(id, req.user.id);
  }
}