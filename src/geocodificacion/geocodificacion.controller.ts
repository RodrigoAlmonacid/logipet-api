import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GeocodificacionService } from './geocodificacion.service';

@Controller('geocodificacion')
@UseGuards(AuthGuard('jwt'))
export class GeocodificacionController {
  constructor(private readonly geocodificacionService: GeocodificacionService) {}

  @Get('buscar')
  buscar(@Query('q') q: string) {
    return this.geocodificacionService.buscar(q);
  }

  @Get('inversa')
  inversa(@Query('lat') lat: string, @Query('lon') lon: string) {
    return this.geocodificacionService.inversa(lat, lon);
  }
}