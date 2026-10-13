import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { EmpleadoService } from './empleado.service';

@Controller('empleados')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class EmpleadoController {
  constructor(private readonly empleadosService: EmpleadoService) {}

  @Post()
  @RequirePermissions(PERMISOS.EMPLEADO_CREATE)
  create(@Body() dto: CreateEmpleadoDto) {
    return this.empleadosService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISOS.EMPLEADO_VIEW)
  findAll() {
    return this.empleadosService.findAll();
  }
  
  @Get(':id')
  @RequirePermissions(PERMISOS.EMPLEADO_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.empleadosService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISOS.EMPLEADO_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmpleadoDto) {
    return this.empleadosService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISOS.EMPLEADO_DELETE)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.empleadosService.remove(id, req.user.id);
  }
}