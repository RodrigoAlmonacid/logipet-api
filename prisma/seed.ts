import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const salt = 10;
  
  const rolPrueba = await prisma.rol.upsert({
    where: { nombre: 'Logipet' },
    update: {},
    create: { nombre: 'Logipet', descripcion: 'Rol inicial de prueba' },
  });

  await prisma.empleado.upsert({
    where: { email: 'rodrigo@logipet.com' },
    update: {},
    create: {
      email: 'rodrigo@logipet.com',
      pass: await bcrypt.hash('rodrigoPrueba', salt),
      nombre: 'Rodrigo',
      apellido: 'Prueba',
      legajo: 'prueba-1',
      roles: {
        connect : [{ id: rolPrueba.id}],
      }
    },
  });

  await prisma.empleado.upsert({
    where: { email: 'lucas@logipet.com' },
    update: {},
    create: {
      email: 'lucas@logipet.com',
      pass: await bcrypt.hash('lucasPrueba', salt),
      nombre: 'Lucas',
      apellido: 'Prueba',
      legajo: 'prueba-2',
      roles: {
        connect : [{ id: rolPrueba.id}],
      }
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });