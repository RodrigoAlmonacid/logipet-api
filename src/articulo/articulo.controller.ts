import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';
import { ArticuloService } from './articulo.service';

@Controller('articulos')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('adminUser')
export class ArticuloController {
  constructor(private readonly articuloService: ArticuloService) {}

  @Post() create(@Body() dto: CreateArticuloDto) { return this.articuloService.create(dto); }
  @Get() findAll() { return this.articuloService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.articuloService.findOne(id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateArticuloDto) { return this.articuloService.update(id, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.articuloService.remove(id); }
}