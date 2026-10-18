import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { RequirePermissions } from './../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { PedidoService } from './pedido.service';
import { PresupuestoPdfService } from './presupuesto-pdf.service';
import { RechazarPedidoDto } from './dto/rechazar-pedido.dto';
import { CancelarPedidoDto } from './dto/cancelat-pedido.dto';
import { AuthUser } from '../auth/auth-user';

@Controller('pedidos')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PedidoController {
  constructor(
    private readonly pedidoService: PedidoService,
    private readonly presupuestoPdfService: PresupuestoPdfService,
  ) { }

  @Post()
  @RequirePermissions(PERMISOS.PEDIDO_CREATE)
  create(@Body() dto: CreatePedidoDto, @Req() req: { user: { id: number } }) {
    return this.pedidoService.create(dto, req.user.id);
  }

  @Get()
  @RequirePermissions(
    PERMISOS.PEDIDO_VIEW, PERMISOS.PEDIDO_VIEW_ALL,
    PERMISOS.PEDIDO_APPROVE, PERMISOS.PEDIDO_REJECT, PERMISOS.PEDIDO_PREPARE, PERMISOS.PEDIDO_ROUTE,
  ) // el guard deja pasar con cualquiera; el service chequea el permiso exacto de cada vista
  findAll(@Query('vista') vista: string, @Req() req: { user: AuthUser }) {
    return this.pedidoService.findAll(req.user, vista);
  }

  @Patch(':id/reabrir')
  @RequirePermissions(PERMISOS.PEDIDO_UPDATE)
  reabrir(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    return this.pedidoService.reabrir(id, req.user);
  }

  @Get(':id')
  @RequirePermissions(
  PERMISOS.PEDIDO_VIEW, PERMISOS.PEDIDO_VIEW_ALL,
  PERMISOS.PEDIDO_APPROVE, PERMISOS.PEDIDO_REJECT, PERMISOS.PEDIDO_PREPARE, PERMISOS.PEDIDO_ROUTE,
)
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    return this.pedidoService.findOne(id, req.user);
  }

  @Get(':id/presupuesto')
  @RequirePermissions(PERMISOS.PEDIDO_VIEW)

  async descargarPresupuesto(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: { id: number } },
    @Res() res: Response,
  ) {
    const pedido = await this.pedidoService.findOneParaExportar(id, req.user.id);
    const pdf = await this.presupuestoPdfService.generar(pedido);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="presupuesto.pdf"',
    });

    res.end(pdf);
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
  @RequirePermissions(PERMISOS.PEDIDO_CANCEL, PERMISOS.PEDIDO_CANCEL_ANY) // el guard usa some(): alcanza con uno
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarPedidoDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.pedidoService.cancelar(id, dto, req.user);
  }

  @Patch(':id/aprobar')
  @RequirePermissions(PERMISOS.PEDIDO_APPROVE)
  aprobar(@Param('id', ParseIntPipe) id: number) {
    return this.pedidoService.aprobar(id);
  }

  @Patch(':id/rechazar')
  @RequirePermissions(PERMISOS.PEDIDO_REJECT)
  rechazar(@Param('id', ParseIntPipe) id: number, @Body() dto: RechazarPedidoDto) {
    return this.pedidoService.rechazar(id, dto.observacion);
  }
}
//
// POST pedido/:id/confirmar	pedido:confirmar	vendedor
// POST pedido/:id/aprobar	pedido:aprobar	administración
// POST pedido/:id/rechazar	pedido:rechazar	administración
// POST pedido/:id/cancelar	pedido:cancelar	vendedor / administración / depósito
// POST pedido/:id/tomar	pedido:preparar	depósito
// POST pedido/:id/preparado	pedido:preparar	depósito
// POST pedido/:id/entregar	pedido:entregar	chofer
// POST pedido/:id/no-entregado	pedido:entregar	chofer
// 