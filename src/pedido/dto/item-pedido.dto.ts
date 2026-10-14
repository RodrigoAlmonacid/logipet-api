import { IsInt, Min } from 'class-validator';

export class ItemPedidoDto {
  @IsInt()
  articuloId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}