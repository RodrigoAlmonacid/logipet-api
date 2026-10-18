import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RechazarPedidoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  observacion!: string;
}