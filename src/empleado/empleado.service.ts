import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmpleadoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEmpleadoDto: CreateEmpleadoDto) {
    const { email, nombre, apellido, legajo } = createEmpleadoDto;

    // Rule: Validar que no exista el email
    const existe = await this.prisma.empleado.findUnique({ where: { email } });
    if (existe) {
      throw new ConflictException('El email ya se encuentra registrado');
    }

    // Generar contraseña provisoria (ejemplo: Logipet123)
    const tempPassword = 'Logipet' + Math.floor(1000 + Math.random() * 9000);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Rule: Crear usuario inactivo y sin roles asignados
    const nuevoEmpleado = await this.prisma.empleado.create({
      data: {
        nombre,
        apellido,
        email,
        legajo,
        pass: hashedPassword,
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        legajo: true,
      },
    });

    // TODO: Enviar notificación por mail con tempPassword

    return {
      message: 'Empleado creado exitosamente',
      empleado: nuevoEmpleado,
      // Devuelvo tempPassword temporalmente para que pruebes en Postman sin el mail listo
      tempPassword, 
    };
  }
}