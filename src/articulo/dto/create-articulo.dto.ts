import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateArticuloDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsNumber()
  @IsNotEmpty()
  precio: number;

  @IsNotEmpty()
  @IsString()
  presentacion: string;

  @IsOptional()
  @IsString()
  descripcion: string;

  @IsNotEmpty()
  @IsString()
  nombre: string;

  @IsNumber()
  @IsOptional()
  stock: number;

  @IsNumber()
  @IsOptional()
  marcaId: number;
}
