import { IsNotEmpty, IsString } from 'class-validator';

export class CreateMarcaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}