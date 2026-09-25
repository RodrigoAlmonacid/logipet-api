import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from './../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'jwtSecretLogipet',
    });
  }

  async validate(payload: any) {
  const empleado = await this.prisma.empleado.findUnique({
    where: { id: payload.sub },
    include: { roles: true },
  });
  if (!empleado || !empleado.activo) throw new UnauthorizedException();
  return { id: empleado.id, email: empleado.email, roles: empleado.roles.map((r) => r.nombre) };
}
}