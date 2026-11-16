import {
  Body,
  Controller,
  Delete,
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
import { CreateDepositoDto } from './dto/create-deposito.dto';
import { UpdateDepositoDto } from './dto/update-deposito.dto';
import { DepositoService } from './deposito.service';

// ============================================================
// DepositoController — endpoints REST para depósitos.
//
// Sigue el patrón de EmpleadoController:
//   - @UseGuards(AuthGuard('jwt'), PermissionsGuard)
//   - @RequirePermissions por endpoint
//   - ParseIntPipe para validar IDs
//   - Retorna directamente el resultado del service (sin envelope)
// ============================================================

@Controller('depositos')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class DepositoController {
  constructor(private readonly depositoService: DepositoService) {}

  @Post()
  @RequirePermissions(PERMISOS.DEPOSITO_CREATE)
  create(@Body() dto: CreateDepositoDto) {
    return this.depositoService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISOS.DEPOSITO_VIEW)
  findAll() {
    return this.depositoService.findAll();
  }

  /**
   * Devuelve sólo depósitos activos — usado por el dropdown de
   * selección de depósito en la UI de crear PlanRuta.
   */
  @Get('activos')
  @RequirePermissions(PERMISOS.DEPOSITO_VIEW)
  findActivos() {
    return this.depositoService.findActivos();
  }

  @Get(':id')
  @RequirePermissions(PERMISOS.DEPOSITO_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.depositoService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISOS.DEPOSITO_UPDATE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepositoDto,
  ) {
    return this.depositoService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISOS.DEPOSITO_DELETE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.depositoService.remove(id);
  }
}
