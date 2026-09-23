import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateEmpleadoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  apellido: string;

  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  legajo: string;

  activo: boolean=false;
}