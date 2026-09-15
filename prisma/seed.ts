import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const salt = 10;
  
  const rolPrueba = await prisma.rol.upsert({
    where: { name: 'Logipet' },
    update: {},
    create: { name: 'Logipet', description: 'Rol inicial de prueba' },
  });

  await prisma.user.upsert({
    where: { email: 'rodrigo@logipet.com' },
    update: {},
    create: {
      email: 'rodrigo@logipet.com',
      password: await bcrypt.hash('rodrigoPrueba', salt),
      firstName: 'Rodrigo',
      lastName: 'Prueba',
      roleId: rolPrueba.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'lucas@logipet.com' },
    update: {},
    create: {
      email: 'lucas@logipet.com',
      password: await bcrypt.hash('lucasPrueba', salt),
      firstName: 'Lucas',
      lastName: 'Prueba',
      roleId: rolPrueba.id,
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