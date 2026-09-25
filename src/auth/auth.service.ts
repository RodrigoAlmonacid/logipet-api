import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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
}