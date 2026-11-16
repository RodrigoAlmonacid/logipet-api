import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { AnalisisIaService } from './analisis-ia.service';
import { ReabastecimientoService } from './reabastecimiento.service';

@Controller('reabastecimiento')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class ReabastecimientoController {
  constructor(
    private readonly service: ReabastecimientoService,
    private readonly analisis: AnalisisIaService,
  ) {}

  @Get()
  @RequirePermissions(PERMISOS.STOCK_VIEW)
  resumen() {
    return this.service.resumen();
  }

  @Post('analisis')
  @RequirePermissions(PERMISOS.STOCK_ANALYZE)
  analizar() {
    return this.analisis.analizar();
  }
}
