import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MSG_HORA = 'La hora debe tener formato HH:mm';

export class ComercioDatosDto {
  @IsString() @IsNotEmpty()
  nombre!: string;

  @IsOptional() @IsString()
  telefono?: string;

  @IsString() @IsNotEmpty()
  direccion!: string;

  @IsNumber() @Min(-90) @Max(90)
  latitud!: number;

  @IsNumber() @Min(-180) @Max(180)
  longitud!: number;

  @Matches(HORA, { message: MSG_HORA }) horaAbreMat!: string;
  @Matches(HORA, { message: MSG_HORA }) horaCierreMat!: string;
  @Matches(HORA, { message: MSG_HORA }) horaAbreVesp!: string;
  @Matches(HORA, { message: MSG_HORA }) horaCierreVesp!: string;
}