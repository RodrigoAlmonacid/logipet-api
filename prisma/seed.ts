
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
import { popularidad, elegirPonderados, factorEstacional, seedStockCoherente } from './seed-demanda';

const prisma = new PrismaClient();

const SALT = 10;
const EMPLEADOS_EXTRA = 18;

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

  controlStock: {
    descripcion: 'Evalúa compras a proveedores',
    permisos: [
      P.STOCK_VIEW, P.ARTICULO_VIEW
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
        in: ['vendedor', 'administracion', 'deposito', 'ruteo', 'chofer', 'controlStock'],
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

  const distribucionRoles = [
    { nombre: 'vendedor', cantidad: 30 },
    { nombre: 'administracion', cantidad: 3 },
    { nombre: 'deposito', cantidad: 8 },
    { nombre: 'ruteo', cantidad: 2 },
    { nombre: 'chofer', cantidad: 6 },
    { nombre: 'controlStock', cantidad: 2 },
  ];

  let n = 3;

  for (const { nombre, cantidad } of distribucionRoles) {
    const rol = rolesGestion.find(
      (r) => r.nombre.toLowerCase() === nombre.toLowerCase(),
    );

    if (!rol) {
      throw new Error(`No se encontró el rol "${nombre}" en rolesGestion`);
    }

    for (let i = 0; i < cantidad; i++) {
      const numero = n++;
      const email = `empleado${String(numero).padStart(2, '0')}@logipet-demo.com`;

      await prisma.empleado.upsert({
        where: { email },
        update: {},
        create: {
          email,
          pass: passwordHash,
          nombre: faker.person.firstName(),
          apellido: faker.person.lastName(),
          legajo: `prueba-${numero}`,
          activo: true,
          roles: {
            connect: [{ id: rol.id }],
          },
        },
      });
    }
  }

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

const PEDIDOS_HISTORICOS = 3000;

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
  console.log('Generando pedidos históricos (7-8 días de ciclo por pedido)...');

  const yaExisten = await prisma.pedido.count({
    where: {
      createdAt: {
        gte: new Date('2024-11-04T00:00:00.000Z'),
        lt: new Date('2026-11-05T00:00:00.000Z'),
      },
    },
  });

  if (yaExisten > 0) {
    console.log(`Ya existen ${yaExisten} pedidos en el período histórico. Se omite la generación.`);
    return;
  }

  const estados = await prisma.estado.findMany();
  const estadoId = new Map(estados.map((e) => [e.nombre, e.id]));

  for (const nombre of Object.keys(DESCRIPCIONES_ESTADOS)) {
    if (!estadoId.has(nombre)) throw new Error(`No existe el estado: ${nombre}`);
  }

  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    include: { comercios: { where: { activo: true } } },
  });
  const clientesConComercios = clientes.filter((c) => c.comercios.length > 0);

  const articulos = await prisma.articulo.findMany({
    where: { deletedAt: null, alicuotaIva: { isNot: null } },
    include: { alicuotaIva: true },
  });

  // Empleados por rol
  const vendedores = await prisma.empleado.findMany({ where: { activo: true, roles: { some: { nombre: 'vendedor' } } } });
  const choferes = await prisma.empleado.findMany({ where: { activo: true, roles: { some: { nombre: 'chofer' } } } });
  const admins = await prisma.empleado.findMany({ where: { activo: true, roles: { some: { nombre: 'administracion' } } } });
  const depositos = await prisma.empleado.findMany({ where: { activo: true, roles: { some: { nombre: 'deposito' } } } });
  const ruteos = await prisma.empleado.findMany({ where: { activo: true, roles: { some: { nombre: 'ruteo' } } } });

  if (!clientesConComercios.length || !vendedores.length || !articulos.length || !choferes.length || !admins.length || !depositos.length || !ruteos.length) {
    throw new Error('Faltan catálogos o empleados necesarios para auditar estados.');
  }

  const camionesData = [
    { interno: 101, marca: 'Mercedes-Benz', modelo: 'Sprinter', capacidad: 1200 },
    { interno: 102, marca: 'Iveco', modelo: 'Daily', capacidad: 1500 },
    { interno: 103, marca: 'Ford', modelo: 'Transit', capacidad: 1000 },
  ];
  const camiones = [];
  for (const cData of camionesData) {
    camiones.push(await prisma.camion.upsert({
      where: { interno: cData.interno },
      update: { marca: cData.marca, modelo: cData.modelo, capacidad: cData.capacidad, deletedAt: null },
      create: cData,
    }));
  }

  // Desplazamos la fecha fin máxima para que el pedido tenga al menos 8 días libres antes del presente
  const fechaInicio = new Date('2024-11-04T00:00:00.000Z');
  const fechaFinPedidos = new Date('2026-10-25T23:59:59.000Z'); // Deja 9 días de margen

  const motivosCancelacion = ['ARREPENTIMIENTO', 'PRODUCTO_DANADO', 'CLIENTE_RECHAZO'] as MotivoBaja[];

  type PedidoGenerado = {
    clienteId: number; comercioId: number; empleadoId: number;
    importe: number; pesoGramos: number; createdAt: Date;
    entregaEstimada: Date | null; stockDescontado: boolean;
    articulos: any[]; historialEstados: any[]; envioId?: number;
    claveEnvio?: string;
  };

  const pedidos: PedidoGenerado[] = [];
  const enviosPorFechaCamion = new Map<string, { fechaEntrega: Date; camionId: number; choferId: number }>();

  const pop = popularidad(articulos);

  const cantEntregados = Math.round(PEDIDOS_HISTORICOS * 0.8);
  const cantCancelados = Math.round(PEDIDOS_HISTORICOS * 0.1);
  const tipos: ('entregado' | 'cancelado' | 'rechazado')[] = mezclar([
    ...Array.from({ length: cantEntregados }, () => 'entregado' as const),
    ...Array.from({ length: cantCancelados }, () => 'cancelado' as const),
    ...Array.from({ length: PEDIDOS_HISTORICOS - cantEntregados - cantCancelados }, () => 'rechazado' as const),
  ]);

  for (let i = 0; i < PEDIDOS_HISTORICOS; i++) {
    const cliente = elegir(clientesConComercios);
    const comercio = elegir(cliente.comercios);
    const vendedor = elegir(vendedores);
    const admin = elegir(admins);
    const empDeposito = elegir(depositos);
    const empRuteo = elegir(ruteos);
    const chofer = elegir(choferes);

    const tipo = tipos[i];
    const fechaPedido = fechaAleatoria(fechaInicio, fechaFinPedidos);

    // -- 1. GENERAR SECUENCIA DE ESTADOS BASADO EN REGLAS DE TRANSICIÓN --
    const secuenciaEstados: { estado: string; auditorId: number }[] = [];
    secuenciaEstados.push({ estado: 'borrador', auditorId: vendedor.id });
    secuenciaEstados.push({ estado: 'pendiente', auditorId: vendedor.id });

    if (tipo === 'entregado') {
      secuenciaEstados.push({ estado: 'pendiente_preparacion', auditorId: admin.id });
      secuenciaEstados.push({ estado: 'en_preparacion', auditorId: empDeposito.id });
      secuenciaEstados.push({ estado: 'preparado', auditorId: empDeposito.id });
      secuenciaEstados.push({ estado: 'en_ruta', auditorId: empRuteo.id });

      // Simular un 10% de probabilidad de que no se haya entregado y se reprograme
      if (Math.random() < 0.1) {
        secuenciaEstados.push({ estado: 'no_entregado', auditorId: chofer.id });
        secuenciaEstados.push({ estado: 'en_ruta', auditorId: empRuteo.id });
      }
      secuenciaEstados.push({ estado: 'entregado', auditorId: chofer.id });

    } else if (tipo === 'rechazado') {
      secuenciaEstados.push({ estado: 'rechazado', auditorId: admin.id });
    } else if (tipo === 'cancelado') {
      // Puede cancelarse en diferentes puntos de la preparación
      const nivelAvance = randomInt(0, 4);
      if (nivelAvance >= 1) secuenciaEstados.push({ estado: 'pendiente_preparacion', auditorId: admin.id });
      if (nivelAvance >= 2) secuenciaEstados.push({ estado: 'en_preparacion', auditorId: empDeposito.id });
      if (nivelAvance >= 3) {
        secuenciaEstados.push({ estado: 'preparado', auditorId: empDeposito.id });
        secuenciaEstados.push({ estado: 'en_ruta', auditorId: empRuteo.id });
      }
      secuenciaEstados.push({ estado: 'cancelado', auditorId: admin.id });
    }

    // -- 2. REPARTIR 7 a 8 DÍAS ENTRE LOS ESTADOS DE LA SECUENCIA --
    const diasTotales = 7 + Math.random(); // 7.0 a 8.0 días aprox.
    const msTotales = diasTotales * 24 * 60 * 60 * 1000;

    // Creamos "pesos" aleatorios para cada transición
    const pesos = Array.from({ length: secuenciaEstados.length - 1 }, () => Math.random());
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);

    const historial: any[] = [];
    let fechaActual = new Date(fechaPedido);
    let fechaEntregaDefinitiva: Date | null = null;

    for (let s = 0; s < secuenciaEstados.length; s++) {
      const est = secuenciaEstados[s];
      let fechaFinEstado = null;

      if (s < secuenciaEstados.length - 1) {
        // Calcular tiempo hasta el siguiente estado basado en su "peso"
        const msFraccion = msTotales * (pesos[s] / sumaPesos);
        fechaFinEstado = new Date(fechaActual.getTime() + msFraccion);
      }

      const extras: any = { auditorId: est.auditorId };
      if (est.estado === 'cancelado') {
        extras.motivo = elegir(motivosCancelacion);
        extras.observacion = 'Cancelación simulada (dato histórico)';
      } else if (est.estado === 'rechazado') {
        extras.observacion = 'Rechazo simulado (dato histórico)';
      } else if (est.estado === 'entregado') {
        fechaEntregaDefinitiva = fechaActual;
      }

      historial.push({
        estadoId: estadoId.get(est.estado)!,
        fechaCreac: fechaActual,
        fechaFin: fechaFinEstado,
        ...extras,
      });

      if (fechaFinEstado) fechaActual = new Date(fechaFinEstado);
    }

    // -- 3. CALCULAR MONTOS DEL PEDIDO --
    const mesPedido = fechaPedido.getUTCMonth();
    const pesosArt = articulos.map((a) => (pop.get(a.id) ?? 0.01) * factorEstacional(a.especie, mesPedido));
    const articulosElegidos = elegirPonderados(articulos, pesosArt, randomInt(1, 7), Math.random);
    let importePedido = 0;
    let pesoPedido = 0;

    const detalles = articulosElegidos.map((articulo) => {
      const cantidad = Math.max(1, Math.round(randomInt(1, 9) * (1 + 4 * (pop.get(articulo.id) ?? 0.01))));
      const precioVenta = redondear((articulo.precioSugeridoPublico ?? articulo.precio) * (1 - ((fechaFinPedidos.getTime() - fechaPedido.getTime()) / (fechaFinPedidos.getTime() - fechaInicio.getTime())) * 0.45));
      const descPorc = elegir([0, 0, 0, 5, 8, 10]);
      const ivaPorc = articulo.alicuotaIva?.porcentaje ?? 21;

      const importeNeto = (precioVenta * cantidad) * (1 - (descPorc / 100));
      importePedido += importeNeto + (importeNeto * (ivaPorc / 100));
      if (articulo.pesoGramos) pesoPedido += articulo.pesoGramos * cantidad;

      return {
        articuloId: articulo.id, cantidad, precioVenta,
        alicuotaIvaPorcentaje: ivaPorc, descuentoPorcentaje: descPorc,
        pesoUnitarioGramos: articulo.pesoGramos ?? null,
      };
    });

    let envioId: number | undefined;
    let claveEnvio: string | undefined;

    // Solo se asocia a un Envío si la ruta logró completarse 
    if (fechaEntregaDefinitiva) {
      const camion = elegir(camiones);
      claveEnvio = `${fechaEntregaDefinitiva.toISOString().slice(0, 10)}-${camion.id}`;

      enviosPorFechaCamion.set(claveEnvio, {
        fechaEntrega: fechaEntregaDefinitiva,
        camionId: camion.id,
        choferId: chofer.id,
      });
    }

    pedidos.push({
      clienteId: cliente.id,
      comercioId: comercio.id,
      empleadoId: vendedor.id,
      importe: redondear(importePedido),
      pesoGramos: pesoPedido,
      createdAt: fechaPedido,
      entregaEstimada: null,
      stockDescontado: tipo === 'entregado', // Stock solo bajó si se entregó (simplificación del historial)
      articulos: detalles,
      historialEstados: historial,
      envioId,
      claveEnvio,
    });
  }
  pedidos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // 4. INSERTAR EN BASE DE DATOS
  const envioIds = new Map<string, number>();

  for (const [clave, envioData] of enviosPorFechaCamion.entries()) {
    const envio = await prisma.envio.create({
      data: {
        fechaEntrega: envioData.fechaEntrega,
        camionId: envioData.camionId,
        empleados: { connect: [{ id: envioData.choferId }] },
      },
    });
    envioIds.set(clave, envio.id);
  }


  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    const claveEnvio = pedido.claveEnvio;
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
        articulos: { create: pedido.articulos },
        historialEstados: { create: pedido.historialEstados },
      },
    });
  }

  console.log(`Se generaron ${PEDIDOS_HISTORICOS} pedidos históricos (ciclos de 7-8 días), ${enviosPorFechaCamion.size} envíos y 3 camiones.`);
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
  await seedStockCoherente(prisma);

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
