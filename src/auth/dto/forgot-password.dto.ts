import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'El formato del email es inválido' })
  @IsNotEmpty()
  email: string;
}
