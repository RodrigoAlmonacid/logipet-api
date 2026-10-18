import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from './../../prisma/prisma.service';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está definido');
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: any) {
  const empleado = await this.prisma.empleado.findUnique({
    where: { id: payload.sub },
    include: { roles: { include: { permisos: true } } },
  });

  if (!empleado || !empleado.activo) throw new UnauthorizedException();

  const permisosUsuario = Array.from(
      new Set(empleado.roles.flatMap((rol) => rol.permisos.map((p) => p.codigo))) 
    );
  return { id: empleado.id, email: empleado.email, roles: empleado.roles.map((r) => r.nombre), permisos: permisosUsuario };
}
}