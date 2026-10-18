// prisma/seed.ts
import 'dotenv/config';
import { PrismaClient, CondicionIva } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { PERMISOS } from '../src/utils/permisos.constants';

const prisma = new PrismaClient();
const SALT = 10;

faker.seed(2026); // misma data en cada corrida, en cualquier compu

const CANTIDAD_CLIENTES = 20;
const CANTIDAD_ARTICULOS = 50;
const CANTIDAD_MARCAS = 15;
const EMPLEADOS_EXTRA = 8;

const ESTADOS = [
  'borrador', 'pendiente', 'aprobado', 'rechazado', 'en armado',
  'armado', 'en distribución', 'entregado', 'entregado parcial', 'cancelado',
];

async function seedPermisosYRoles() {
  const permisos = await Promise.all(
    Object.values(PERMISOS).map((codigo) =>
      prisma.permiso.upsert({ where: { codigo }, update: { codigo }, create: { codigo } }),
    ),
  );

  const idsDe = (...codigos: string[]) =>
    permisos.filter((p) => codigos.includes(p.codigo)).map((p) => ({ id: p.id }));

  const upsertRol = (nombre: string, codigos: string[]) =>
    prisma.rol.upsert({
      where: { nombre },
      update: { permisos: { set: idsDe(...codigos) } },
      create: { nombre, permisos: { connect: idsDe(...codigos) } },
    });

  await upsertRol('superadmin', Object.values(PERMISOS));
  await upsertRol('vendedor', [
    PERMISOS.PEDIDO_CREATE, PERMISOS.PEDIDO_VIEW, PERMISOS.PEDIDO_UPDATE,
    PERMISOS.PEDIDO_CONFIRM, PERMISOS.PEDIDO_CANCEL,
    PERMISOS.CLIENTE_VIEW, PERMISOS.ARTICULO_VIEW,
  ]);
  await upsertRol('adminVentas', [
    PERMISOS.CLIENTE_VIEW, PERMISOS.PEDIDO_APPROVE, PERMISOS.PEDIDO_REJECT,
    PERMISOS.CLIENTE_VIEW
  ]);
  await upsertRol('adminUser', [PERMISOS.EMPLEADO_VIEW, PERMISOS.EMPLEADO_CREATE, PERMISOS.EMPLEADO_UPDATE, PERMISOS.EMPLEADO_DELETE]);
  await upsertRol('adminCliente', [PERMISOS.CLIENTE_VIEW, PERMISOS.CLIENTE_CREATE, PERMISOS.CLIENTE_UPDATE, PERMISOS.CLIENTE_DELETE]);
  await upsertRol('adminProducto', [PERMISOS.ARTICULO_VIEW, PERMISOS.ARTICULO_CREATE, PERMISOS.ARTICULO_UPDATE, PERMISOS.ARTICULO_DELETE,
    PERMISOS.MARCA_VIEW, PERMISOS.MARCA_CREATE, PERMISOS.MARCA_UPDATE, PERMISOS.MARCA_DELETE
  ]);
}

async function seedCatalogos() {
  await prisma.$transaction(
    ESTADOS.map((nombre) =>
      prisma.estado.upsert({ where: { nombre }, update: {}, create: { nombre } }),
    ),
  );

  await prisma.$transaction([
    prisma.alicuotaIva.upsert({ where: { codigoAfip: 3 }, update: {}, create: { porcentaje: 0, codigoAfip: 3, descripcion: 'Exento / 0%' } }),
    prisma.alicuotaIva.upsert({ where: { codigoAfip: 4 }, update: {}, create: { porcentaje: 10.5, codigoAfip: 4, descripcion: 'Reducida' } }),
    prisma.alicuotaIva.upsert({ where: { codigoAfip: 5 }, update: {}, create: { porcentaje: 21, codigoAfip: 5, descripcion: 'General' } }),
    prisma.alicuotaIva.upsert({ where: { codigoAfip: 6 }, update: {}, create: { porcentaje: 27, codigoAfip: 6, descripcion: 'Incrementada' } }),
  ]);
}

async function seedMarcas() {
  const nombres = new Set<string>();
  while (nombres.size < CANTIDAD_MARCAS) nombres.add(faker.company.name());

  return Promise.all(
    [...nombres].map((nombre) =>
      prisma.marca.upsert({ where: { nombre }, update: {}, create: { nombre } }),
    ),
  );
}

async function seedArticulos(marcaIds: number[], alicuotaIds: number[]) {
  const presentaciones = ['Unidad', 'Caja x6', 'Caja x12', 'Caja x24', 'Pack x3', 'Bolsa 1kg', 'Bolsa 5kg', 'Bolsa 20kg'];

  return Promise.all(
    Array.from({ length: CANTIDAD_ARTICULOS }, (_, i) => {
      const codigo = `ART-${String(i + 1).padStart(4, '0')}`;
      return prisma.articulo.upsert({
        where: { codigo },
        update: {},
        create: {
          codigo,
          nombre: faker.commerce.productName(),
          descripcion: faker.commerce.productDescription(),
          presentacion: faker.helpers.arrayElement(presentaciones),
          precio: Number(faker.commerce.price({ min: 500, max: 45000 })),
          // ~1 de cada 10 queda sin stock, a propósito, para probar la validación
          stock: i % 10 === 0 ? 0 : faker.number.int({ min: 1, max: 300 }),
          marcaId: faker.helpers.arrayElement(marcaIds),
          alicuotaIvaId: faker.helpers.arrayElement(alicuotaIds),
        },
      });
    }),
  );
}

async function seedClientes() {
  const condiciones = Object.values(CondicionIva);

  return Promise.all(
    Array.from({ length: CANTIDAD_CLIENTES }, (_, i) => {
      const email = `cliente${String(i + 1).padStart(2, '0')}@logipet-demo.com`;
      const condicionIva = faker.helpers.arrayElement(condiciones);
      // Neuquén capital +/- un radio chico, para que el mapa muestre algo coherente
      const lat = -38.9516 + faker.number.float({ min: -0.08, max: 0.08, fractionDigits: 6 });
      const lon = -68.0591 + faker.number.float({ min: -0.08, max: 0.08, fractionDigits: 6 });

      return prisma.cliente.upsert({
        where: { email },
        update: {},
        create: {
          nombre: faker.person.firstName(),
          apellido: faker.person.lastName(),
          comercio: faker.company.name(),
          email,
          telefono: faker.phone.number(),
          direccion: faker.location.streetAddress(),
          latitud: lat,
          longitud: lon,
          horaAbreMat: '08:00',
          horaCierreMat: '13:00',
          horaAbreVesp: '17:00',
          horaCierreVesp: '20:30',
          // los últimos 3 quedan inactivos, para probar esa validación
          activo: i < CANTIDAD_CLIENTES - 3,
          cuit: condicionIva === 'CONSUMIDOR_FINAL' ? null : faker.string.numeric(11),
          condicionIva,
        },
      });
    }),
  );
}

async function seedEmpleados() {
  const rolSuperadmin = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'superadmin' } });
  const rolVendedor = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'vendedor' } });
  const otrosRoles = await prisma.rol.findMany({
    where: { nombre: { in: ['adminVentas', 'adminUser', 'adminCliente', 'adminProducto'] } },
  });

  // Los dos usuarios "de siempre": uno con acceso total, otro vendedor para probar pedidos
  await prisma.empleado.upsert({
    where: { email: 'rodrigo@logipet.com' },
    update: { activo: true, roles: { set: [{ id: rolSuperadmin.id }] } },
    create: {
      email: 'rodrigo@logipet.com', pass: await bcrypt.hash('rodrigoPrueba', SALT),
      nombre: 'Rodrigo', apellido: 'Almonacid', legajo: 'fai-4968', activo: true,
      roles: { connect: [{ id: rolSuperadmin.id }] },
    },
  });

  await prisma.empleado.upsert({
    where: { email: 'lucas@logipet.com' },
    update: { activo: true, roles: { set: [{ id: rolVendedor.id }] } },
    create: {
      email: 'lucas@logipet.com', pass: await bcrypt.hash('lucasPrueba', SALT),
      nombre: 'Lucas', apellido: 'Cerda', legajo: 'fai-4967', activo: true,
      roles: { connect: [{ id: rolVendedor.id }] },
    },
  });

  // Empleados de relleno, con un rol random de los "de gestión"
  await Promise.all(
    Array.from({ length: EMPLEADOS_EXTRA }, (_, i) => {
      const n = i + 3; // sigue después de prueba-1 y prueba-2
      const email = `empleado${String(n).padStart(2, '0')}@logipet-demo.com`;
      return prisma.empleado.upsert({
        where: { email },
        update: {},
        create: {
          email, pass: bcrypt.hashSync('Logipet1234', SALT),
          nombre: faker.person.firstName(), apellido: faker.person.lastName(),
          legajo: `prueba-${n}`, activo: true,
          roles: { connect: [{ id: faker.helpers.arrayElement(otrosRoles).id }] },
        },
      });
    }),
  );
}

async function main() {
  await seedPermisosYRoles();
  await seedCatalogos();

  const marcas = await seedMarcas();
  const alicuotas = await prisma.alicuotaIva.findMany();
  await seedArticulos(marcas.map((m) => m.id), alicuotas.map((a) => a.id));

  await seedClientes();
  await seedEmpleados();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// 
//   import { PrismaClient } from '@prisma/client';
// import { PERMISOS as P } from '../src/utils/permisos.constants';
// 
// const prisma = new PrismaClient();
// 
// const ROLES: Record<string, { descripcion: string; permisos: string[] }> = {
//   vendedor: {
//     descripcion: 'Arma presupuestos y confirma pedidos propios',
//     permisos: [
//       P.PEDIDO_VIEW, P.PEDIDO_CREATE, P.PEDIDO_UPDATE, P.PEDIDO_CONFIRM, P.PEDIDO_CANCEL,
//       P.ARTICULO_VIEW, P.CLIENTE_VIEW,
//     ],
//   },
//   administracion: {
//     descripcion: 'Aprueba o rechaza pedidos y administra maestros',
//     permisos: [
//       P.PEDIDO_VIEW, P.PEDIDO_VIEW_ALL, P.PEDIDO_APPROVE, P.PEDIDO_REJECT, P.PEDIDO_CANCEL_ANY,
//       P.ARTICULO_VIEW, P.ARTICULO_CREATE, P.ARTICULO_UPDATE, P.ARTICULO_DELETE,
//       P.MARCA_VIEW, P.MARCA_CREATE, P.MARCA_UPDATE, P.MARCA_DELETE,
//       P.CLIENTE_VIEW, P.CLIENTE_CREATE, P.CLIENTE_UPDATE, P.CLIENTE_DELETE,
//       P.EMPLEADO_VIEW,
//     ],
//   },
//   deposito: {
//     descripcion: 'Prepara pedidos',
//     permisos: [P.PEDIDO_VIEW, P.PEDIDO_VIEW_ALL, P.ARTICULO_VIEW],
//   },
//   ruteo: {
//     descripcion: 'Arma camiones y rutas',
//     permisos: [P.PEDIDO_VIEW, P.PEDIDO_VIEW_ALL, P.CLIENTE_VIEW],
//   },
//   chofer: {
//     descripcion: 'Entrega pedidos',
//     permisos: [P.PEDIDO_VIEW, P.PEDIDO_VIEW_ALL, P.CLIENTE_VIEW],
//   },
// };
// 
// async function main() {
//   for (const codigo of Object.values(P)) {
//     await prisma.permiso.upsert({ where: { codigo }, update: {}, create: { codigo } });
//   }
// 
//   for (const [nombre, { descripcion, permisos }] of Object.entries(ROLES)) {
//     const refs = permisos.map((codigo) => ({ codigo }));
//     await prisma.rol.upsert({
//       where: { nombre },
//       update: { descripcion, permisos: { set: refs } },
//       create: { nombre, descripcion, permisos: { connect: refs } },
//     });
//   }
// 
//   // estados del pedido
//   for (const nombre of [
//     'borrador', 'pendiente', 'rechazado', 'pendiente_preparacion', 'en_preparacion',
//     'preparado', 'en_ruta', 'entregado', 'no_entregado', 'cancelado',
//   ]) {
//     await prisma.estado.upsert({ where: { nombre }, update: {}, create: { nombre } });
//   }
// }
// 
// main().finally(() => prisma.$disconnect());