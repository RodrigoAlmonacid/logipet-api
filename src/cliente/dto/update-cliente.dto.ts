import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';
import { CreateClienteDto } from './create-cliente.dto';

export class UpdateClienteDto extends PartialType(CreateClienteDto) {
  @IsOptional() @IsBoolean()
  activo?: boolean;
}