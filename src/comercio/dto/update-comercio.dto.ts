import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { ComercioDatosDto } from './datos-comercio.dto';

export class UpdateComercioDto extends PartialType(ComercioDatosDto) {
  @IsOptional() @IsBoolean()
  activo?: boolean;
}