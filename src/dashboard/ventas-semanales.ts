// Ventas por semana — agregación pura (sin Prisma ni Nest), para poder testearla sola.
// "Venta" = pedido cuyo estado actual es `entregado`; se la ubica en la semana en que se entregó.
// Semana = lunes a domingo, hora Argentina (UTC-3 fijo).

export type Metrica = 'importe' | 'pedidos' | 'unidades';
export type Desglose = 'total' | 'marca' | 'especie' | 'vendedor' | 'equipo';

export interface LineaVenta {
  cantidad: number;
  precioVenta: number;
  alicuotaIvaPorcentaje: number;
  descuentoPorcentaje: number;
  marca: string | null;
  especie: 'PERRO' | 'GATO' | null;
}
export interface PedidoVenta {
  id: number;
  fecha: Date; // cuándo pasó a "entregado"
  vendedor: { id: number; nombre: string; apellido: string };
  lineas: LineaVenta[];
}

export interface SerieSemanal {
  nombre: string;
  valores: number[];
}
export interface ResultadoVentas {
  semanas: string[]; // lunes de cada semana, "YYYY-MM-DD"
  series: SerieSemanal[];
  totalPeriodo: number;
}

const OFFSET_AR_MS = -3 * 3600 * 1000;
const SEMANA_MS = 7 * 24 * 3600 * 1000;
const MAX_SERIES = 5; // por encima se agrupa en "Otras"

/** Lunes 00:00 hora Argentina de la semana que contiene `d`, como instante UTC. */
export function inicioSemanaLocal(d: Date): Date {
  const local = new Date(d.getTime() + OFFSET_AR_MS);
  const dow = local.getUTCDay(); // 0 = domingo
  const diasDesdeLunes = (dow + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diasDesdeLunes) - OFFSET_AR_MS);
}

export const etiquetaSemana = (inicio: Date) => new Date(inicio.getTime() + OFFSET_AR_MS).toISOString().slice(0, 10);

/** Lista de lunes (instantes) de las últimas `cantidad` semanas, incluida la actual. */
export function rangoSemanas(ahora: Date, cantidad: number): Date[] {
  const actual = inicioSemanaLocal(ahora).getTime();
  return Array.from({ length: cantidad }, (_, i) => new Date(actual - (cantidad - 1 - i) * SEMANA_MS));
}

export const importeLinea = (l: LineaVenta) =>
  l.precioVenta * l.cantidad * (1 - l.descuentoPorcentaje / 100) * (1 + l.alicuotaIvaPorcentaje / 100);

function claveDe(desglose: Desglose, p: PedidoVenta, l: LineaVenta): string {
  switch (desglose) {
    case 'marca': return l.marca ?? 'Sin marca';
    case 'especie': return l.especie === 'PERRO' ? 'Perros' : l.especie === 'GATO' ? 'Gatos' : 'Otros';
    case 'vendedor': return `${p.vendedor.apellido}, ${p.vendedor.nombre}`;
    default: return 'Total';
  }
}

interface Celda { importe: number; unidades: number; pedidos: Set<number> }
const valorDe = (c: Celda, m: Metrica) => (m === 'importe' ? c.importe : m === 'unidades' ? c.unidades : c.pedidos.size);

export function armarSerie(pedidos: PedidoVenta[], metrica: Metrica, desglose: Desglose, semanas: Date[]): ResultadoVentas {
  const indiceSemana = new Map(semanas.map((s, i) => [s.getTime(), i]));

  const acumular = (mapaClave: (k: string) => string) => {
    const acc = new Map<string, Celda[]>();
    for (const p of pedidos) {
      const idx = indiceSemana.get(inicioSemanaLocal(p.fecha).getTime());
      if (idx === undefined) continue; // fuera del rango pedido
      for (const l of p.lineas) {
        const k = mapaClave(claveDe(desglose, p, l));
        if (!acc.has(k)) acc.set(k, semanas.map(() => ({ importe: 0, unidades: 0, pedidos: new Set<number>() })));
        const c = acc.get(k)![idx];
        c.importe += importeLinea(l);
        c.unidades += l.cantidad;
        c.pedidos.add(p.id); // un pedido con 2 marcas cuenta en cada marca (pero una sola vez por marca)
      }
    }
    return acc;
  };

  // 1ª pasada: ranking de series por el total del período en la métrica elegida.
  const crudo = acumular((k) => k);
  const totalesPorSerie = [...crudo.entries()].map(([k, celdas]) => {
    const unicos = new Set<number>();
    celdas.forEach((c) => c.pedidos.forEach((id) => unicos.add(id)));
    const total = metrica === 'pedidos' ? unicos.size : celdas.reduce((s, c) => s + valorDe(c, metrica), 0);
    return { k, total };
  });
  // Especie tiene orden fijo (el color sigue a la entidad); el resto, por total descendente.
  const ordenFijo = ['Perros', 'Gatos', 'Otros'];
  totalesPorSerie.sort((a, b) =>
    desglose === 'especie' ? ordenFijo.indexOf(a.k) - ordenFijo.indexOf(b.k) : b.total - a.total || a.k.localeCompare(b.k),
  );

  const principales = desglose === 'especie' || desglose === 'total' ? totalesPorSerie : totalesPorSerie.slice(0, MAX_SERIES);
  const claves = new Set(principales.map((s) => s.k));
  const hayOtras = totalesPorSerie.length > principales.length;

  // 2ª pasada: lo que no entró en el top se junta en "Otras" (uniendo pedidos, sin duplicar).
  const final = hayOtras ? acumular((k) => (claves.has(k) ? k : 'Otras')) : crudo;

  const nombres = principales.map((s) => s.k);
  if (hayOtras) nombres.push('Otras');
  if (nombres.length === 0 && desglose === 'total') nombres.push('Total'); // sin ventas: línea en cero, no un gráfico vacío

  const redondear = (n: number) => (metrica === 'importe' ? Math.round(n * 100) / 100 : n);
  const series = nombres.map((nombre) => ({
    nombre,
    valores: (final.get(nombre) ?? semanas.map(() => ({ importe: 0, unidades: 0, pedidos: new Set<number>() }))).map((c) => redondear(valorDe(c, metrica))),
  }));

  // Total del período real (cada pedido una sola vez para la métrica "pedidos").
  let totalPeriodo = 0;
  if (metrica === 'pedidos') {
    totalPeriodo = new Set(pedidos.filter((p) => indiceSemana.has(inicioSemanaLocal(p.fecha).getTime())).map((p) => p.id)).size;
  } else {
    for (const p of pedidos) {
      if (!indiceSemana.has(inicioSemanaLocal(p.fecha).getTime())) continue;
      for (const l of p.lineas) totalPeriodo += metrica === 'importe' ? importeLinea(l) : l.cantidad;
    }
    totalPeriodo = redondear(totalPeriodo);
  }

  return { semanas: semanas.map(etiquetaSemana), series, totalPeriodo };
}

// ------------------------------------------------------------
// Comparativas entre vendedores
//   - Dueño/administración (desglose 'vendedor'): vendedores elegidos (por defecto los 5 mejores) + línea de promedio.
//     NO hay "Otras": sumar 25 vendedores contra 5 individuales no es comparable.
//   - Vendedor (desglose 'equipo'): "Yo" contra el promedio del equipo, sin revelar a los demás.
// ------------------------------------------------------------
export const MAX_VENDEDORES_COMPARADOS = 8;
export interface VendedorResumen { id: number; nombre: string; total: number }
export interface ResultadoVendedores extends ResultadoVentas {
  vendedores: VendedorResumen[]; // todos los que vendieron en el período (para el selector)
  seleccion: number[]; // ids que se están mostrando
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Valor de la métrica por semana para un conjunto de pedidos (un pedido cuenta una sola vez). */
function valoresSemanales(pedidos: PedidoVenta[], metrica: Metrica, semanas: Date[]): number[] {
  const idx = new Map(semanas.map((s, i) => [s.getTime(), i]));
  const acc = semanas.map(() => ({ importe: 0, unidades: 0, ids: new Set<number>() }));
  for (const p of pedidos) {
    const i = idx.get(inicioSemanaLocal(p.fecha).getTime());
    if (i === undefined) continue;
    for (const l of p.lineas) {
      acc[i].importe += importeLinea(l);
      acc[i].unidades += l.cantidad;
    }
    acc[i].ids.add(p.id);
  }
  return acc.map((c) => (metrica === 'importe' ? redondear2(c.importe) : metrica === 'unidades' ? c.unidades : c.ids.size));
}

const suma = (v: number[]) => v.reduce((a, b) => a + b, 0);
const promedio = (v: number[], n: number) => v.map((x) => (n > 0 ? redondear2(x / n) : 0));

export function armarPorVendedor(
  pedidos: PedidoVenta[], metrica: Metrica, semanas: Date[], nVendedores: number, seleccion: number[] = [],
): ResultadoVendedores {
  const porVendedor = new Map<number, { nombre: string; pedidos: PedidoVenta[] }>();
  for (const p of pedidos) {
    const e = porVendedor.get(p.vendedor.id) ?? { nombre: `${p.vendedor.apellido}, ${p.vendedor.nombre}`, pedidos: [] };
    e.pedidos.push(p);
    porVendedor.set(p.vendedor.id, e);
  }
  const calculados = [...porVendedor.entries()]
    .map(([id, e]) => {
      const valores = valoresSemanales(e.pedidos, metrica, semanas);
      return { id, nombre: e.nombre, valores, total: suma(valores) };
    })
    .filter((v) => v.total > 0)
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

  const elegidos = (seleccion.length ? calculados.filter((v) => seleccion.includes(v.id)) : calculados.slice(0, 5)).slice(
    0, MAX_VENDEDORES_COMPARADOS,
  );
  const todos = valoresSemanales(pedidos, metrica, semanas);

  return {
    semanas: semanas.map(etiquetaSemana),
    series: [
      ...elegidos.map((v) => ({ nombre: v.nombre, valores: v.valores })),
      { nombre: 'Promedio por vendedor', valores: promedio(todos, nVendedores) },
    ],
    totalPeriodo: redondear2(suma(todos)),
    vendedores: calculados.map((v) => ({ id: v.id, nombre: v.nombre, total: v.total })),
    seleccion: elegidos.map((v) => v.id),
  };
}

export function armarEquipo(
  pedidos: PedidoVenta[], metrica: Metrica, semanas: Date[], miId: number, nVendedores: number,
): ResultadoVentas {
  const mios = valoresSemanales(pedidos.filter((p) => p.vendedor.id === miId), metrica, semanas);
  const todos = valoresSemanales(pedidos, metrica, semanas);
  return {
    semanas: semanas.map(etiquetaSemana),
    series: [
      { nombre: 'Yo', valores: mios },
      { nombre: 'Promedio del equipo', valores: promedio(todos, nVendedores) },
    ],
    totalPeriodo: redondear2(suma(mios)),
  };
}

// ------------------------------------------------------------
// Qué puede ver cada usuario
// ------------------------------------------------------------
export interface Acceso {
  alcance: 'todos' | 'propios';
  metricas: Metrica[];
  desgloses: Desglose[];
}

/**
 *  - pedido:view_all (administración, superadmin): todo, de todos los vendedores, incluido el desglose por vendedor.
 *  - pedido:view (vendedor): solo SUS ventas, y "Yo vs. equipo" (su serie contra el PROMEDIO del equipo:
 *    nunca ve cuánto vendió otro vendedor puntual).
 *  - stock:view (control de stock): ventas de todos pero solo en unidades/pedidos, sin importes ni vendedores.
 */
export function resolverAcceso(permisos: string[]): Acceso | null {
  if (permisos.includes('pedido:view_all')) {
    return { alcance: 'todos', metricas: ['importe', 'pedidos', 'unidades'], desgloses: ['total', 'marca', 'especie', 'vendedor'] };
  }
  if (permisos.includes('pedido:view')) {
    return { alcance: 'propios', metricas: ['importe', 'pedidos', 'unidades'], desgloses: ['total', 'marca', 'especie', 'equipo'] };
  }
  if (permisos.includes('stock:view')) {
    return { alcance: 'todos', metricas: ['unidades', 'pedidos'], desgloses: ['total', 'marca', 'especie'] };
  }
  return null;
}
