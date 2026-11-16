import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { CreatePlanRutaDto } from './dto/create-plan-ruta.dto';
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

  @Get(':id')
  @RequirePermissions(PERMISOS.PLANRUTA_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.planRutaService.findOne(id);
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
}
