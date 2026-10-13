import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/decorators/require-permissions.docorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISOS } from '../utils/permisos.constants';
import { RolService } from './rol.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

@Controller('roles')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class RolController {
  constructor(private readonly rolService: RolService) {}

  @Post()
  @RequirePermissions(PERMISOS.ROL_MANAGE)
  create(@Body() dto: CreateRolDto) {
    return this.rolService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISOS.ROL_VIEW)
  findAll() {
    return this.rolService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISOS.ROL_VIEW)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISOS.ROL_MANAGE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRolDto) {
    return this.rolService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISOS.ROL_MANAGE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolService.remove(id);
  }
}