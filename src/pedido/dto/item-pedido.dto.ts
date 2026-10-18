import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ItemPedidoDto {
  @IsInt()
  articuloId: number;

  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  descuentoPorcentaje?: number;
}