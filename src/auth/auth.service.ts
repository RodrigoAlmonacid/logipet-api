import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

const RESET_PASSWORD_PURPOSE = 'reset-password';
const RESET_TOKEN_TTL = '15m';
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService
  ) { }

  async login(loginDto: LoginDto) {
    const { email, pass } = loginDto;

    const empleado = await this.prisma.empleado.findUnique({
      where: { email },
      include: { roles: true },
    });

    if (!empleado) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!empleado.activo) {
      throw new UnauthorizedException('El usuario se encuentra inactivo');
    }

    const isPasswordValid = await bcrypt.compare(pass, empleado.pass);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: empleado.id,
      email: empleado.email,
      roles: empleado.roles.map((r) => r.nombre),
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: empleado.id,
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        email: empleado.email,
        roles: payload.roles,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const empleado = await this.prisma.empleado.findUnique({ where: { email: dto.email } });

    const respuestaGenerica = {
      message: 'Si el email está registrado, recibirás un correo con instrucciones.'
    };

    if (!empleado) {
      return respuestaGenerica;
    }

    const token = await this.jwtService.signAsync(
      { sub: empleado.id, purpose: RESET_PASSWORD_PURPOSE },
      { expiresIn: RESET_TOKEN_TTL },
    );

    const resetLink = `${process.env.FRONT_URL}/reset-password?token=${token}`;

    await this.mailService.send(
      empleado.email,
      'Recuperación de contraseña - LogiPet',
      `
        <p>Hola ${empleado.nombre},</p>
        <p>Recibimos un pedido para restablecer tu contraseña. Este link vence en 15 minutos:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Si vos no pediste esto, podés ignorar este correo.</p>
      `,
    );

    return respuestaGenerica;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    let payload: { sub: number; purpose: string };

    try {
      payload = await this.jwtService.verifyAsync(dto.token);
    } catch {
      throw new BadRequestException('El link expiró o no es válido. Pedí uno nuevo.');
    }

    if (payload.purpose !== RESET_PASSWORD_PURPOSE) {
      throw new BadRequestException('El link expiró o no es válido. Pedí uno nuevo.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.empleado.update({
      where: { id: payload.sub },
      data: { pass: hashedPassword },
    });

    return { message: 'Contraseña actualizada correctamente.' };
  }
}