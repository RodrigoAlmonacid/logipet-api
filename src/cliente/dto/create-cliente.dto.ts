import { IsEmail, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CondicionIva } from '@prisma/client';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  apellido: string;

  @IsString()
  @IsNotEmpty()
  comercio: string;

  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaAbreMat: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaAbreVesp: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaCierreMat: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaCierreVesp: string;

  @IsString()
  @IsNotEmpty()
  direccion: string;

  @IsNotEmpty()
  @IsNumber()
  latitud: number

  @IsNotEmpty()
  @IsNumber()
  longitud: number

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @Matches(/^\d{2}-?\d{8}-?\d{1}$/, {
    message: 'El CUIT debe tener el formato XX-XXXXXXXX-X',
  })
  cuit?: string;

  @IsNotEmpty()
  @IsEnum(CondicionIva, { message: 'Condición frente al IVA inválida' })
  condicionIva: CondicionIva;
}