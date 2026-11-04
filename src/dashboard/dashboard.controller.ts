import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

// Solo exige sesión activa, sin permiso específico: las métricas son para todos los empleados.
// Por eso el endpoint devuelve únicamente agregados, nunca pedidos ni datos de clientes.
@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  resumen() {
    return this.dashboardService.resumen();
  }
}