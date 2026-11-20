import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class CreateCamionDto {
  @IsInt() @Min(1)
  interno: number;

  @IsString() @IsNotEmpty() @MaxLength(50)
  marca: string;

  @IsOptional() @IsString() @MaxLength(50)
  modelo?: string | null;

  @IsNumber() @IsPositive()
  capacidad: number;

  @IsOptional() @IsNumber() @IsPositive()
  capacidadVolumen?: number | null;

  @IsOptional() @IsBoolean()
  disponible?: boolean;
}

export class UpdateCamionDto extends PartialType(CreateCamionDto) {}