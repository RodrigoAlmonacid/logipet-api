import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';
import { CreateEmpleadoDto } from './create-empleado.dto';

export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {
  @IsOptional() @IsBoolean()
  activo?: boolean;

  @IsOptional() @IsArray() @IsInt({ each: true })
  roleIds?: number[];
}