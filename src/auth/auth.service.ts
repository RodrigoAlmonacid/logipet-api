import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

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

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passReset.create({
      data: {
        empleadoId: empleado.id,
        tokenHash,
        fechaExpira: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const resetLink = `${process.env.FRONT_URL}/reset-password?token=${rawToken}`;

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
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
 
    const passReset = await this.prisma.passReset.findUnique({ where: { tokenHash } });
 
    const tokenInvalido =
      !passReset || passReset.usado || passReset.fechaExpira.getTime() < Date.now();
 
    if (tokenInvalido) {
      throw new BadRequestException('El link expiró o no es válido. Pedí uno nuevo.');
    }
 
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
 
    await this.prisma.$transaction([
      this.prisma.empleado.update({
        where: { id: passReset.empleadoId },
        data: { pass: hashedPassword },
      }),
      this.prisma.passReset.updateMany({
        where: { empleadoId: passReset.empleadoId, usado: false },
        data: { usado: true },
      }),
    ]);
 
    return { message: 'Contraseña actualizada correctamente.' };
  }
}