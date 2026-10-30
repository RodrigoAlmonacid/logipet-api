import { Module } from '@nestjs/common';
import { GeocodificacionController } from './geocodificacion.controller';
import { GeocodificacionService } from './geocodificacion.service';

@Module({
  controllers: [GeocodificacionController],
  providers: [GeocodificacionService],
})
export class GeocodificacionModule {}