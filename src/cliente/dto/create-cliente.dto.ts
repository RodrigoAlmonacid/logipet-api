import { CondicionIva } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ComercioDatosDto } from '../../comercio/dto/datos-comercio.dto';

export class CreateClienteDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsNotEmpty() apellido!: string;
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() telefono!: string;
  @IsString() @IsNotEmpty() cuit!: string;
  @IsEnum(CondicionIva) condicionIva!: CondicionIva;

  @ValidateNested()
  @Type(() => ComercioDatosDto)
  comercio!: ComercioDatosDto;
}