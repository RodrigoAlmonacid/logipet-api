import { MotivoBaja } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelarPedidoDto {
  @IsOptional()
  @IsEnum(MotivoBaja)
  motivo?: MotivoBaja;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}