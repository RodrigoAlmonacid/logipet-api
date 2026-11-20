import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PERMISOS } from '../utils/permisos.constants';
import { CamionService } from './camion.service';
import { CreateCamionDto, UpdateCamionDto } from './dto/camion.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('camiones')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class CamionController {
  constructor(private readonly camionService: CamionService) {}

  @Get() 
  @RequirePermissions(PERMISOS.CAMION_VIEW)
  listar() { return this.camionService.listar(); }

  @Get(':id')
  @RequirePermissions(PERMISOS.CAMION_VIEW)
  obtener(@Param('id', ParseIntPipe) id: number) { return this.camionService.obtener(id); }

  @Post()
    @RequirePermissions(PERMISOS.CAMION_CREATE)
  crear(@Body() dto: CreateCamionDto) { return this.camionService.crear(dto); }

  @Patch(':id')
  @RequirePermissions(PERMISOS.CAMION_UPDATE)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCamionDto) {
    return this.camionService.actualizar(id, dto);
  }

  @Delete(':id') @HttpCode(204) 
  @RequirePermissions(PERMISOS.CAMION_DELETE)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.camionService.eliminar(id); }
}