import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { EmpleadoService } from './empleado.service';

@Controller('empleados')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class EmpleadoController {
  constructor(private readonly empleadosService: EmpleadoService) {}

  @Post()
  @Roles('adminUser') // Solo rol administrador
  create(@Body() createEmpleadoDto: CreateEmpleadoDto) {
    return this.empleadosService.create(createEmpleadoDto);
  }
}