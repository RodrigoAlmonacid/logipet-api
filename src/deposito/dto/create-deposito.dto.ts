import { IsBoolean, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

// ============================================================
// DTO para crear un depósito.
//
// Convención: las horas se guardan como strings "HH:MM" porque
// así las persistimos en PostgreSQL (sin timezone headaches) y
// así las usa Comercio.horaAbreMat etc. en el schema existente.
// ============================================================

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00 - 23:59

export class CreateDepositoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'La dirección es obligatoria' })
  direccion: string;

  @IsLatitude({ message: 'La latitud debe ser un número válido entre -90 y 90' })
  latitud: number;

  @IsLongitude({ message: 'La longitud debe ser un número válido entre -180 y 180' })
  longitud: number;

  @IsString()
  @Matches(HORA_REGEX, { message: 'horaApertura debe tener formato HH:MM (ej: 08:00)' })
  horaApertura: string;

  @IsString()
  @Matches(HORA_REGEX, { message: 'horaCierre debe tener formato HH:MM (ej: 18:00)' })
  horaCierre: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
