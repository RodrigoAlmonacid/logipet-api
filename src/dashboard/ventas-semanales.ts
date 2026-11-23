// ============================================================
// Ventas por semana — agregación pura (sin Prisma ni Nest), para poder testearla sola.
//
// "Venta" = pedido cuyo estado actual es `entregado`; se la ubica en la semana en que se entregó.
// Semana = lunes a domingo, hora Argentina (UTC-3 fijo).
// ============================================================

export type Metrica = 'importe' | 'pedidos' | 'unidades';
export type Desglose = 'total' | 'marca' | 'especie' | 'vendedor';

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
// Qué puede ver cada usuario
// ------------------------------------------------------------
export interface Acceso {
  alcance: 'todos' | 'propios';
  metricas: Metrica[];
  desgloses: Desglose[];
}

/**
 *  - pedido:view_all (administración, superadmin): todo, de todos los vendedores, incluido el desglose por vendedor.
 *  - pedido:view (vendedor): solo SUS ventas; sin desglose por vendedor (sería comparar consigo mismo).
 *  - stock:view (control de stock): ventas de todos pero solo en unidades/pedidos, sin importes ni vendedores.
 */
export function resolverAcceso(permisos: string[]): Acceso | null {
  if (permisos.includes('pedido:view_all')) {
    return { alcance: 'todos', metricas: ['importe', 'pedidos', 'unidades'], desgloses: ['total', 'marca', 'especie', 'vendedor'] };
  }
  if (permisos.includes('pedido:view')) {
    return { alcance: 'propios', metricas: ['importe', 'pedidos', 'unidades'], desgloses: ['total', 'marca', 'especie'] };
  }
  if (permisos.includes('stock:view')) {
    return { alcance: 'todos', metricas: ['unidades', 'pedidos'], desgloses: ['total', 'marca', 'especie'] };
  }
  return null;
}
