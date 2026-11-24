import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../auth/auth-user';
import { DashboardService } from './dashboard.service';
import { VentasSemanalesService } from './ventas-semanales.service';

// Solo exige sesión activa, sin permiso específico: las métricas del resumen son para todos los empleados.
// Por eso `GET /dashboard` devuelve únicamente agregados, nunca pedidos ni datos de clientes.
// `GET /dashboard/ventas-semanales` decide qué ve cada usuario según sus permisos (ver resolverAcceso en ventas-semanales).
@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly ventasSemanales: VentasSemanalesService,
  ) {}

  @Get()
  resumen() {
    return this.dashboardService.resumen();
  }

  @Get('ventas-semanales')
  ventas(
    @Req() req: { user: AuthUser },
    @Query('semanas') semanas?: string,
    @Query('metrica') metrica?: string,
    @Query('desglose') desglose?: string,
    @Query('vendedores') vendedores?: string,
  ) {
    return this.ventasSemanales.obtener(req.user, { semanas, metrica, desglose, vendedores });
  }
}
