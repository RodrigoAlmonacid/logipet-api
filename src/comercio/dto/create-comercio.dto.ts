import { IsInt } from 'class-validator';
import { ComercioDatosDto } from './datos-comercio.dto';

export class CreateComercioDto extends ComercioDatosDto {
  @IsInt()
  clienteId!: number;
}