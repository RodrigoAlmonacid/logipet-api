import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from './../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PermisoService } from './permiso.service';
import { PERMISOS } from '../utils/permisos.constants';

@Controller('permisos')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermissions(PERMISOS.ROL_MANAGE)
export class PermisoController {
  constructor(private readonly permisoService: PermisoService) {}

  @Get()
  findAll() {
    return this.permisoService.findAll();
  }
}