import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  ValidateNested,
} from 'class-validator';

export class AsignacionEnvioDto {
  @IsInt()
  envioId!: number;

  /** Chofer y, si lo hay, ayudante: entre 1 y 2 empleados por camión. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsInt({ each: true })
  empleadoIds!: number[];
}

export class DespacharPlanRutaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AsignacionEnvioDto)
  asignaciones!: AsignacionEnvioDto[];
}
