import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthUser } from '../auth/auth-user';
import { PERMISOS } from '../utils/permisos.constants';
import { CreatePlanRutaDto } from './dto/create-plan-ruta.dto';
import { DespacharPlanRutaDto } from './dto/despachar-plan-ruta.dto';
import { OptimizePlanRutaDto } from './dto/optimize-plan-ruta.dto';
import { PlanRutaService } from './plan-ruta.service';

// ============================================================
// PlanRutaController — endpoints REST para planes de ruta.
//
// Sigue el mismo patrón que DepositoController y EmpleadoController:
//   - @UseGuards(AuthGuard('jwt'), PermissionsGuard)
//   - @RequirePermissions por endpoint
//   - ParseIntPipe para validar IDs
// ============================================================

@Controller('plan-rutas')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PlanRutaController {
  constructor(private readonly planRutaService: PlanRutaService) {}

  @Post()
  @RequirePermissions(PERMISOS.PLANRUTA_CREATE)
  create(@Body() dto: CreatePlanRutaDto) {
    return this.planRutaService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISOS.PLANRUTA_VIEW)
  findAll() {
    return this.planRutaService.findAll();
  }

  /** Próximos días hábiles en los que se puede armar una hoja de ruta (para el selector del front). */
  @Get('fechas-disponibles')
  @RequirePermissions(PERMISOS.PLANRUTA_CREATE)
  fechasDisponibles() {
    return this.planRutaService.fechasDisponibles();
  }

  /** Cola de ruteo (pedidos armados + reprogramados) para mostrar antes de crear el plan. */
  @Get('cola')
  @RequirePermissions(PERMISOS.PLANRUTA_CREATE)
  cola() {
    return this.planRutaService.cola();
  }

  /** Hoja de ruta de chofer y ayudante: sus envíos despachados con pedidos todavía en la calle. */
  @Get('mis-envios')
  @RequirePermissions(PERMISOS.ENVIO_VIEW_OWN)
  misEnvios(@Req() req: { user: AuthUser }) {
    return this.planRutaService.misEnvios(req.user.id);
  }

  /** Reparto de hoy de MIS pedidos (vendedor): a qué clientes se visita y cómo viene. */
  @Get('mi-reparto')
  @RequirePermissions(PERMISOS.PEDIDO_VIEW)
  miReparto(@Req() req: { user: AuthUser }) {
    return this.planRutaService.miReparto(req.user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISOS.PLANRUTA_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.planRutaService.findOne(id);
  }

  /** Elimina un plan sin optimizar (PENDIENTE/FALLIDO). */
  @Delete(':id')
  @RequirePermissions(PERMISOS.PLANRUTA_CREATE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.planRutaService.remove(id);
  }

  /** Choferes y ayudantes disponibles para el plan (marca los ocupados ese día). */
  @Get(':id/repartidores')
  @RequirePermissions(PERMISOS.PLANRUTA_DISPATCH)
  repartidores(@Param('id', ParseIntPipe) id: number) {
    return this.planRutaService.repartidores(id);
  }

  /**
   * Cambia el estado de un PlanRuta.
   * Body: { "estado": "PENDIENTE" | "OPTIMIZADO" | "EN_PROCESO" | "FINALIZADO" | "FALLIDO" }
   *
   * Útil para:
   *   - Re-optimizar: pasar de OPTIMIZADO a PENDIENTE, luego POST /:id/optimize
   *   - Marcar como FINALIZADO cuando todos los envíos fueron entregados
   */
  @Patch(':id/estado')
  @RequirePermissions(PERMISOS.PLANRUTA_UPDATE)
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: string,
  ) {
    return this.planRutaService.updateEstado(id, estado);
  }

  /**
   * Ejecuta la optimización del PlanRuta:
   *   1. Trae la matriz de tiempos desde OSRM
   *   2. Llama al solver OR-Tools (routing-wasm)
   *   3. Por cada vehículo, trae la geometría desde OSRM
   *   4. Persiste Envios + asigna Pedidos + setea rutaOptima
   *
   * Body (opcional): { "timeLimitMs": 10000 }
   */
  @Post(':id/optimize')
  @RequirePermissions(PERMISOS.PLANRUTA_OPTIMIZE)
  optimize(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto?: OptimizePlanRutaDto,
  ) {
    return this.planRutaService.optimize(id, dto);
  }

  /**
   * Ruteo confirma la hoja: asigna chofer (y ayudante) a cada camión y los pedidos pasan a "en_ruta".
   * Body: { "asignaciones": [ { "envioId": 10, "empleadoIds": [4, 7] }, ... ] }
   */
  @Post(':id/despachar')
  @RequirePermissions(PERMISOS.PLANRUTA_DISPATCH)
  despachar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DespacharPlanRutaDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.planRutaService.despachar(id, dto, req.user.id);
  }
}
