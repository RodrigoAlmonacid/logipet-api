import { MotivoBaja } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class NoEntregadoDto {
  @IsEnum(MotivoBaja)
  motivo!: MotivoBaja;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacion?: string;
}
