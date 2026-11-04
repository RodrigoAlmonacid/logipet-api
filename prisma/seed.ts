
import 'dotenv/config';

import { PrismaClient, Especie } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MotivoBaja,
} from '@prisma/client';

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
        stock: randomInt(1, 101),
      },
    });
  }

  console.log(`${marcas.size} marcas cargadas`);
  console.log(`${catalogo.length} artículos cargados correctamente`);
}

async function seedClientes() {
  console.log('Cargando clientes y comercios...');

  const { clientes } = JSON.parse(
    readFileSync(
      join(__dirname, 'clientes-comercios-neuquen.json'),
      'utf8',
    ),
  );

  for (const cliente of clientes) {
    const { comercios, ...datosCliente } = cliente;

    await prisma.cliente.upsert({
      where: { email: datosCliente.email },

      update: {
        ...datosCliente,
      },

      create: {
        ...datosCliente,
        comercios: {
          create: comercios,
        },
      },
    });
  }

  console.log(`${clientes.length} clientes cargados correctamente`);
}

// --------------------------------------------------
// PEDIDOS HISTÓRICOS
// --------------------------------------------------

const PEDIDOS_HISTORICOS = 500;

const ESTADOS_PEDIDO = {
  pendiente: 'pendiente',
  pendientePreparacion: 'pendiente_preparacion',
  enPreparacion: 'en_preparacion',
  preparado: 'preparado',
  enRuta: 'en_ruta',
  entregado: 'entregado',
  cancelado: 'cancelado',
  rechazado: 'rechazado',
};

const MOTIVOS_CANCELACION: MotivoBaja[] = [
  'ARREPENTIMIENTO',
  'PRODUCTO_DANADO',
  'CLIENTE_AUSENTE',
  'CLIENTE_RECHAZO',
];

const redondear = (n: number) => Math.round(n * 100) / 100;

function elegir<T>(items: T[]): T {
  return items[randomInt(0, items.length)];
}

function fechaAleatoria(inicio: Date, fin: Date): Date {
  const desde = inicio.getTime();
  const hasta = fin.getTime();

  return new Date(randomInt(desde, hasta + 1));
}

function sumarDias(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

function mezclar<T>(items: T[]): T[] {
  const copia = [...items];

  for (let i = copia.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }

  return copia;
}

async function seedPedidosHistoricos() {
  console.log('Generando pedidos históricos...');

  // Evita duplicar los 500 pedidos si se vuelve a ejecutar el seed.
  // Se identifican por el rango histórico y los datos demo generados.
  const yaExisten = await prisma.pedido.count({
    where: {
      createdAt: {
        gte: new Date('2024-11-04T00:00:00.000Z'),
        lt: new Date('2026-11-05T00:00:00.000Z'),
      },
    },
  });

  if (yaExisten > 0) {
    console.log(
      `Ya existen ${yaExisten} pedidos en el período histórico. Se omite la generación.`,
    );
    return;
  }

  const estados = await prisma.estado.findMany();
  const estadoId = new Map(estados.map((e) => [e.nombre, e.id]));

  for (const nombre of Object.values(ESTADOS_PEDIDO)) {
    if (!estadoId.has(nombre)) {
      throw new Error(`No existe el estado de pedido: ${nombre}`);
    }
  }

  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    include: {
      comercios: {
        where: { activo: true },
      },
    },
  });

  const clientesConComercios = clientes.filter(
    (c) => c.comercios.length > 0,
  );

  const vendedores = await prisma.empleado.findMany({
    where: {
      activo: true,
      roles: {
        some: { nombre: 'vendedor' },
      },
    },
  });

  const articulos = await prisma.articulo.findMany({
    where: {
      deletedAt: null,
      alicuotaIva: { isNot: null },
    },
    include: {
      alicuotaIva: true,
    },
  });

  const choferes = await prisma.empleado.findMany({
    where: {
      activo: true,
      roles: {
        some: { nombre: 'chofer' },
      },
    },
  });

  const auditor = await prisma.empleado.findFirst({
    where: {
      activo: true,
      roles: {
        some: { nombre: 'superadmin' },
      },
    },
  });

  if (!clientesConComercios.length) {
    throw new Error('No hay clientes activos con comercios activos.');
  }
  if (!vendedores.length) {
    throw new Error('No se encontraron empleados con rol vendedor.');
  }
  if (!articulos.length) {
    throw new Error('No hay artículos disponibles para generar pedidos.');
  }
  if (!choferes.length) {
    throw new Error('No se encontraron empleados con rol chofer.');
  }

  // Crear tres camiones chicos.
  const camionesData = [
    { interno: 101, marca: 'Mercedes-Benz', modelo: 'Sprinter', capacidad: 1200 },
    { interno: 102, marca: 'Iveco', modelo: 'Daily', capacidad: 1500 },
    { interno: 103, marca: 'Ford', modelo: 'Transit', capacidad: 1000 },
  ];

  const camiones = [];

  for (const camionData of camionesData) {
    const camion = await prisma.camion.upsert({
      where: { interno: camionData.interno },
      update: {
        marca: camionData.marca,
        modelo: camionData.modelo,
        capacidad: camionData.capacidad,
        deletedAt: null,
      },
      create: camionData,
    });

    camiones.push(camion);
  }

  const fechaInicio = new Date('2024-11-04T00:00:00.000Z');
  const fechaFin = new Date('2026-11-03T23:59:59.000Z');

  type PedidoGenerado = {
    clienteId: number;
    comercioId: number;
    empleadoId: number;
    importe: number;
    pesoGramos: number;
    createdAt: Date;
    entregaEstimada: Date | null;
    stockDescontado: boolean;
    articulos: {
      articuloId: number;
      cantidad: number;
      precioVenta: number;
      alicuotaIvaPorcentaje: number;
      descuentoPorcentaje: number;
      pesoUnitarioGramos: number | null;
    }[];
    historialEstados: {
      estadoId: number;
      fechaCreac: Date;
      fechaFin: Date | null;
      motivo?: MotivoBaja;
      observacion?: string;
      auditorId?: number;
    }[];
    envioId?: number;
  };

  const pedidos: PedidoGenerado[] = [];
  const enviosPorFechaCamion = new Map<
    string,
    { fechaEntrega: Date; camionId: number; choferId: number }
  >();

  for (let i = 0; i < PEDIDOS_HISTORICOS; i++) {
    const cliente = elegir(clientesConComercios);
    const comercio = elegir(cliente.comercios);
    const vendedor = elegir(vendedores);

    // 80% entregados, 10% cancelados, 10% rechazados.
    const tipo =
      i < 400 ? 'entregado' : i < 450 ? 'cancelado' : 'rechazado';

    const fechaPedido = fechaAleatoria(fechaInicio, fechaFin);
    const cantidadLineas = randomInt(1, Math.min(6, articulos.length) + 1);
    const articulosElegidos = mezclar(articulos).slice(0, cantidadLineas);

    let importePedido = 0;
    let pesoPedido = 0;

    const detalles = articulosElegidos.map((articulo) => {
      const cantidad = randomInt(1, 9);

      // Precio sugerido al público si existe; de lo contrario, precio del artículo.
      const precioBase =
        articulo.precioSugeridoPublico ?? articulo.precio;

      // Simulación de precios históricos: más antiguos, algo más bajos.
      const antiguedad =
        (fechaFin.getTime() - fechaPedido.getTime()) /
        (fechaFin.getTime() - fechaInicio.getTime());

      const factorHistorico = 1 - antiguedad * 0.45;
      const precioVenta = redondear(precioBase * factorHistorico);

      const descuentoPorcentaje = elegir([0, 0, 0, 5, 8, 10]);
      const alicuotaIvaPorcentaje =
        articulo.alicuotaIva?.porcentaje ?? 21;

      // Misma fórmula que calcularLinea().
      const importeBruto = precioVenta * cantidad;
      const importeDescuento =
        importeBruto * (descuentoPorcentaje / 100);
      const importeNeto = importeBruto - importeDescuento;
      const importeIva =
        importeNeto * (alicuotaIvaPorcentaje / 100);
      const importeFinal = importeNeto + importeIva;

      importePedido += importeFinal;

      const pesoUnitarioGramos = articulo.pesoGramos ?? null;
      if (pesoUnitarioGramos !== null) {
        pesoPedido += pesoUnitarioGramos * cantidad;
      }

      return {
        articuloId: articulo.id,
        cantidad,
        precioVenta,
        alicuotaIvaPorcentaje,
        descuentoPorcentaje,
        pesoUnitarioGramos,
      };
    });

    importePedido = redondear(importePedido);

    // Estados históricos con intervalos de tiempo coherentes.
    const historial: PedidoGenerado['historialEstados'] = [];

    const agregarEstado = (
      nombre: string,
      fecha: Date,
      fechaFinEstado: Date | null,
      extras: Partial<
        PedidoGenerado['historialEstados'][number]
      > = {},
    ) => {
      historial.push({
        estadoId: estadoId.get(nombre)!,
        fechaCreac: fecha,
        fechaFin: fechaFinEstado,
        ...extras,
      });
    };

    const fechaPendiente = sumarDias(fechaPedido, randomInt(0, 2));
    agregarEstado(
      ESTADOS_PEDIDO.pendiente,
      fechaPendiente,
      null,
    );

    let envioId: number | undefined;

    if (tipo === 'entregado') {
      const fechaPreparacion = sumarDias(fechaPendiente, randomInt(1, 3));
      const fechaEnPreparacion = sumarDias(fechaPreparacion, 0);
      const fechaPreparado = sumarDias(fechaEnPreparacion, 1);
      const fechaRuta = sumarDias(fechaPreparado, 0);
      const fechaEntrega = sumarDias(fechaRuta, randomInt(0, 2));

      historial[0].fechaFin = fechaPreparacion;

      agregarEstado(
        ESTADOS_PEDIDO.pendientePreparacion,
        fechaPreparacion,
        fechaEnPreparacion,
      );
      agregarEstado(
        ESTADOS_PEDIDO.enPreparacion,
        fechaEnPreparacion,
        fechaPreparado,
      );
      agregarEstado(
        ESTADOS_PEDIDO.preparado,
        fechaPreparado,
        fechaRuta,
      );
      agregarEstado(
        ESTADOS_PEDIDO.enRuta,
        fechaRuta,
        fechaEntrega,
      );
      agregarEstado(
        ESTADOS_PEDIDO.entregado,
        fechaEntrega,
        null,
      );

      const camion = elegir(camiones);
      const chofer = elegir(choferes);
      const claveEnvio = `${fechaEntrega.toISOString().slice(0, 10)}-${camion.id}`;

      enviosPorFechaCamion.set(claveEnvio, {
        fechaEntrega,
        camionId: camion.id,
        choferId: chofer.id,
      });

      // Guardamos temporalmente la clave del envío en una propiedad auxiliar.
      (pedidos as any)._envioPorPedido ??= [];
      (pedidos as any)._envioPorPedido[i] = claveEnvio;

      envioId = undefined;
    } else if (tipo === 'cancelado') {
      const fechaCancelacion = sumarDias(fechaPendiente, randomInt(1, 5));
      historial[0].fechaFin = fechaCancelacion;

      agregarEstado(
        ESTADOS_PEDIDO.cancelado,
        fechaCancelacion,
        null,
        {
          motivo: elegir(MOTIVOS_CANCELACION),
          observacion: 'Pedido cancelado (dato histórico de prueba)',
          auditorId: auditor?.id,
        },
      );
    } else {
      const fechaRechazo = sumarDias(fechaPendiente, randomInt(1, 4));
      historial[0].fechaFin = fechaRechazo;

      agregarEstado(
        ESTADOS_PEDIDO.rechazado,
        fechaRechazo,
        null,
        {
          observacion: 'Pedido rechazado (dato histórico de prueba)',
          auditorId: auditor?.id,
        },
      );
    }

    pedidos.push({
      clienteId: cliente.id,
      comercioId: comercio.id,
      empleadoId: vendedor.id,
      importe: importePedido,
      pesoGramos: pesoPedido,
      createdAt: fechaPedido,
      entregaEstimada: null,
      stockDescontado: false,
      articulos: detalles,
      historialEstados: historial,
      envioId,
    });
  }

  // Crear envíos agrupados por fecha y camión.
  const envioIds = new Map<string, number>();

  for (const [clave, envioData] of enviosPorFechaCamion.entries()) {
    const envio = await prisma.envio.create({
      data: {
        fechaEntrega: envioData.fechaEntrega,
        camionId: envioData.camionId,
        empleados: {
          connect: [{ id: envioData.choferId }],
        },
      },
    });

    envioIds.set(clave, envio.id);
  }

  // Crear pedidos y conectar los envíos correspondientes.
  const clavesEnvioPorPedido = (pedidos as any)._envioPorPedido ?? [];

  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    const claveEnvio = clavesEnvioPorPedido[i];
    const envioId = claveEnvio ? envioIds.get(claveEnvio) : undefined;

    await prisma.pedido.create({
      data: {
        clienteId: pedido.clienteId,
        comercioId: pedido.comercioId,
        empleadoId: pedido.empleadoId,
        importe: pedido.importe,
        pesoGramos: pedido.pesoGramos,
        createdAt: pedido.createdAt,
        entregaEstimada: pedido.entregaEstimada,
        stockDescontado: pedido.stockDescontado,
        ...(envioId ? { envioId } : {}),
        articulos: {
          create: pedido.articulos,
        },
        historialEstados: {
          create: pedido.historialEstados,
        },
      },
    });
  }

  console.log(
    `Se generaron ${PEDIDOS_HISTORICOS} pedidos históricos, ${enviosPorFechaCamion.size} envíos y 3 camiones.`,
  );
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
  await seedClientes();
  await seedPedidosHistoricos();

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
