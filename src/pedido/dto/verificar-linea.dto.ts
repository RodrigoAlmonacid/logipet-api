import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class VerificarLineaDto {
  @IsString() @IsNotEmpty() codigo: string;
  @IsInt() @Min(0) cantidad: number;
  @IsOptional() @IsString() @MaxLength(300) justificacion?: string;
}