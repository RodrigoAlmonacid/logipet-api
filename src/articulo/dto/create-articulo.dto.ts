import {
  IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

export class CreateArticuloDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  codigo: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  nombre: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  presentacion: string;

  @IsOptional() @IsString() @MaxLength(500)
  descripcion?: string | null;

  @IsNumber() @Min(0)
  precio: number;

  @IsInt() @Min(0)
  stock: number;

  @IsOptional() @IsInt()
  marcaId?: number | null;
}