import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';
import { ArticuloService } from './articulo.service';

@Controller('articulos')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('adminUser') // aplica a todo el controller
export class ArticuloController {
  constructor(private readonly articulosService: ArticuloService) {}

  @Post()
  create(@Body() dto: CreateArticuloDto) {
    return this.articulosService.create(dto);
  }

  @Get()
  findAll() {
    return this.articulosService.findAll();
  }
  
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articulosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateArticuloDto) {
    return this.articulosService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.articulosService.remove(id);
  }
}