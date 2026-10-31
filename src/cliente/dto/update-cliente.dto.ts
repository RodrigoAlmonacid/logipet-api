import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateClienteDto } from './create-cliente.dto';

export class UpdateClienteDto extends PartialType(OmitType(CreateClienteDto, ['comercio'] as const)) {
  @IsOptional() @IsBoolean()
  activo?: boolean;
}