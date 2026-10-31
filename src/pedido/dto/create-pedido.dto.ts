import { ArrayMinSize, IsArray, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ItemPedidoDto } from './item-pedido.dto';

export class CreatePedidoDto {
  @IsInt()
  clienteId: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items: ItemPedidoDto[];

  @IsInt()
  comercioId!: number;
}