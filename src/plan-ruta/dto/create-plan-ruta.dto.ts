import { ArrayUnique, IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';

export class CreatePlanRutaDto {
  /** Día de entrega (ISO 8601; el front manda la medianoche local con offset -03:00). */
  @IsDateString()
  fecha: string;

  /** Opcional: si no viene se usa el único depósito activo. */
  @IsOptional()
  @IsInt()
  depositoId?: number;

  /** Hora límite de las entregas del día (ISO 8601). */
  @IsDateString()
  horaLimite: string;

  /** Camiones disponibles elegidos por el usuario de ruteo (el service exige al menos uno). */
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  camionIds: number[];
}
