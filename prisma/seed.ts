
import 'dotenv/config';

import { PrismaClient, Especie } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PERMISOS as P } from '../src/utils/permisos.constants';
import { randomInt } from 'crypto';

const prisma = new PrismaClient();

const SALT = 10;
const EMPLEADOS_EXTRA = 8;

faker.seed(2026);

// --------------------------------------------------
// ESTADOS
// --------------------------------------------------

const ESTADOS = [
  'borrador',
  'pendiente',
  'rechazado',
  'pendiente_preparacion',
  'en_preparacion',
  'preparado',
  'en_ruta',
  'entregado',
  'no_entregado',
  'cancelado',
];

const DESCRIPCIONES_ESTADOS: Record<string, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
  pendiente_preparacion: 'Pendiente de preparación',
  en_preparacion: 'En preparación',
  preparado: 'Preparado',
  en_ruta: 'En ruta',
  entregado: 'Entregado',
  no_entregado: 'No entregado',
  cancelado: 'Cancelado',
};

// --------------------------------------------------
// ROLES Y PERMISOS
// --------------------------------------------------

const ROLES: Record<string, { descripcion: string; permisos: string[] }> = {
  superadmin: {
    descripcion: 'Acceso total al sistema',
    permisos: Object.values(P),
  },

  vendedor: {
    descripcion: 'Arma presupuestos y confirma pedidos propios',
    permisos: [
      P.PEDIDO_VIEW,
      P.PEDIDO_CREATE,
      P.PEDIDO_UPDATE,
      P.PEDIDO_CONFIRM,
      P.PEDIDO_CANCEL,
      P.ARTICULO_VIEW,
      P.CLIENTE_VIEW,
    ],
  },

  administracion: {
    descripcion: 'Aprueba o rechaza pedidos y administra maestros',
    permisos: [
      P.PEDIDO_VIEW,
      P.PEDIDO_VIEW_ALL,
      P.PEDIDO_APPROVE,
      P.PEDIDO_REJECT,
      P.PEDIDO_CANCEL_ANY,
      P.ARTICULO_VIEW,
      P.ARTICULO_CREATE,
      P.ARTICULO_UPDATE,
      P.ARTICULO_DELETE,
      P.MARCA_VIEW,
      P.MARCA_CREATE,
      P.MARCA_UPDATE,
      P.MARCA_DELETE,
      P.CLIENTE_VIEW,
      P.CLIENTE_CREATE,
      P.CLIENTE_UPDATE,
      P.CLIENTE_DELETE,
      P.EMPLEADO_VIEW,
    ],
  },

  deposito: {
    descripcion: 'Prepara pedidos',
    permisos: [
      P.PEDIDO_VIEW,
      P.PEDIDO_VIEW_ALL,
      P.ARTICULO_VIEW,
    ],
  },

  ruteo: {
    descripcion: 'Arma camiones y rutas',
    permisos: [
      P.PEDIDO_VIEW,
      P.PEDIDO_VIEW_ALL,
      P.CLIENTE_VIEW,
    ],
  },

  chofer: {
    descripcion: 'Entrega pedidos',
    permisos: [
      P.PEDIDO_VIEW,
      P.PEDIDO_VIEW_ALL,
      P.CLIENTE_VIEW,
    ],
  },
};

// --------------------------------------------------
// INTERFAZ DEL CATÁLOGO
// --------------------------------------------------

interface ArticuloImport {
  marca: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  presentacion: string;
  especie: Especie | null;
  precio: number;
  precioSugeridoPublico: number | null;
  unidadesPorBulto: number;
  pesoGramos: number | null;
  volumenCm3?: number | null;
}

// --------------------------------------------------
// CATÁLOGOS
// --------------------------------------------------

async function seedCatalogos() {
  console.log('Cargando catálogos...');

  // Estados
  await prisma.$transaction(
    ESTADOS.map((nombre) =>
      prisma.estado.upsert({
        where: { nombre },
        update: {
          descripcion: DESCRIPCIONES_ESTADOS[nombre],
        },
        create: {
          nombre,
          descripcion: DESCRIPCIONES_ESTADOS[nombre],
        },
      }),
    ),
  );

  // Alícuotas de IVA
  const alicuotas = [
    { codigoAfip: 3, porcentaje: 0, descripcion: 'Exento / 0%' },
    { codigoAfip: 4, porcentaje: 10.5, descripcion: 'Reducida' },
    { codigoAfip: 5, porcentaje: 21, descripcion: 'General' },
    { codigoAfip: 6, porcentaje: 27, descripcion: 'Incrementada' },
  ];

  await prisma.$transaction(
    alicuotas.map((alicuota) =>
      prisma.alicuotaIva.upsert({
        where: { codigoAfip: alicuota.codigoAfip },
        update: {
          porcentaje: alicuota.porcentaje,
          descripcion: alicuota.descripcion,
        },
        create: alicuota,
      }),
    ),
  );

  console.log('Catálogos cargados correctamente');
}

// --------------------------------------------------
// PERMISOS Y ROLES
// --------------------------------------------------

async function seedRolesYPermisos() {
  console.log('Cargando permisos y roles...');

  // Crear permisos
  for (const codigo of Object.values(P)) {
    await prisma.permiso.upsert({
      where: { codigo },
      update: {},
      create: { codigo },
    });
  }

  // Crear roles y asignar permisos
  for (const [nombre, { descripcion, permisos }] of Object.entries(ROLES)) {
    const refs = permisos.map((codigo) => ({ codigo }));

    await prisma.rol.upsert({
      where: { nombre },

      update: {
        descripcion,
        permisos: {
          set: refs,
        },
      },

      create: {
        nombre,
        descripcion,
        permisos: {
          connect: refs,
        },
      },
    });
  }

  console.log('Roles y permisos cargados correctamente');
}

// --------------------------------------------------
// EMPLEADOS
// --------------------------------------------------

async function seedEmpleados() {
  console.log('Cargando empleados...');

  const rolSuperadmin = await prisma.rol.findUniqueOrThrow({
    where: { nombre: 'superadmin' },
  });

  const rolVendedor = await prisma.rol.findUniqueOrThrow({
    where: { nombre: 'vendedor' },
  });

  // Roles disponibles para empleados ficticios
  const rolesGestion = await prisma.rol.findMany({
    where: {
      nombre: {
        in: ['administracion', 'deposito', 'ruteo', 'chofer'],
      },
    },
  });

  if (rolesGestion.length === 0) {
    throw new Error('No se encontraron roles de gestión');
  }

  // Usuarios principales
  const empleadosPrincipales = [
    {
      email: 'rodrigo@logipet.com',
      password: 'rodrigoPrueba',
      nombre: 'Rodrigo',
      apellido: 'Almonacid',
      legajo: 'fai-4968',
      rolId: rolSuperadmin.id,
    },
    {
      email: 'lucas@logipet.com',
      password: 'lucasPrueba',
      nombre: 'Lucas',
      apellido: 'Cerda',
      legajo: 'fai-4967',
      rolId: rolVendedor.id,
    },
  ];

  for (const empleado of empleadosPrincipales) {
    const { password, rolId, ...datos } = empleado;

    await prisma.empleado.upsert({
      where: { email: datos.email },

      update: {
        activo: true,
        roles: {
          set: [{ id: rolId }],
        },
      },

      create: {
        ...datos,
        pass: await bcrypt.hash(password, SALT),
        activo: true,
        roles: {
          connect: [{ id: rolId }],
        },
      },
    });
  }

  // Empleados ficticios
  const passwordHash = await bcrypt.hash('Logipet1234', SALT);

  await Promise.all(
    Array.from({ length: EMPLEADOS_EXTRA }, (_, i) => {
      const n = i + 3;
      const email = `empleado${String(n).padStart(2, '0')}@logipet-demo.com`;

      const rol = faker.helpers.arrayElement(rolesGestion);

      return prisma.empleado.upsert({
        where: { email },

        update: {},

        create: {
          email,
          pass: passwordHash,
          nombre: faker.person.firstName(),
          apellido: faker.person.lastName(),
          legajo: `prueba-${n}`,
          activo: true,
          roles: {
            connect: [{ id: rol.id }],
          },
        },
      });
    }),
  );

  console.log('Empleados cargados correctamente');
}

// --------------------------------------------------
// MARCAS Y ARTÍCULOS
// --------------------------------------------------

async function seedArticulos() {
  console.log('Cargando marcas y artículos...');

  const catalogo: ArticuloImport[] = JSON.parse(
    readFileSync(join(__dirname, 'articulos-catalogo.json'), 'utf8'),
  );

  // Todo el catálogo lleva IVA del 21 %
  const iva21 = await prisma.alicuotaIva.findUniqueOrThrow({
    where: { porcentaje: 21 },
  });

  // Crear marcas y guardar sus IDs
  const marcas = new Map<string, number>();

  for (const nombre of new Set(catalogo.map((a) => a.marca))) {
    const marca = await prisma.marca.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });

    marcas.set(nombre, marca.id);
  }

  // Crear o actualizar artículos
  for (const { marca, ...articulo } of catalogo) {
    const marcaId = marcas.get(marca);

    if (marcaId === undefined) {
      throw new Error(`No se encontró la marca: ${marca}`);
    }

    await prisma.articulo.upsert({
      where: { codigo: articulo.codigo },

      update: {
        ...articulo,
        marcaId,
        alicuotaIvaId: iva21.id,
        stock: randomInt(1, 101),
      },

      create: {
        ...articulo,
        marcaId,
        alicuotaIvaId: iva21.id,
      },
    });
  }

  console.log(`${marcas.size} marcas cargadas`);
  console.log(`${catalogo.length} artículos cargados correctamente`);
}

// --------------------------------------------------
// EJECUCIÓN PRINCIPAL
// --------------------------------------------------

async function main() {
  console.log('====================================');
  console.log(' Iniciando seed de LOGIPET');
  console.log('====================================');

  await seedCatalogos();
  await seedRolesYPermisos();
  await seedEmpleados();
  await seedArticulos();

  console.log('====================================');
  console.log(' Seed finalizado correctamente');
  console.log('====================================');
}

main()
  .catch((error) => {
    console.error('Error ejecutando seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
