// Núcleo estadístico del asistente de reabastecimiento.
// Son funciones puras (sin Prisma ni Nest): se pueden probar solas y explicar en la defensa.
//
// Modelo, por artículo, sobre ventas MENSUALES (las semanales son demasiado ralas en un catálogo grande):
//   1. Índice estacional por mes calendario (agrupado por especie, suavizado hacia 1).
//   2. Nivel base = promedio ponderado de los últimos 3 meses, desestacionalizados.
//   3. Pronóstico = nivel × índice estacional del mes en que cae cada semana del horizonte.
//   4. Stock de seguridad = z · σ_semanal · √lead.
//   5. Sugerencia de compra = demanda(lead + ciclo) + seguridad − stock.

export const SEMANAS_POR_MES = 52 / 12; // 4,333...
export const Z_SERVICIO = 1.65; // 95 % de nivel de servicio
const PESOS_NIVEL = [0.2, 0.3, 0.5]; // del más viejo al más reciente

export interface SerieMensual {
  /** Unidades vendidas por mes, ordenadas de más viejo a más reciente. */
  unidades: number[];
  /** Mes calendario (0-11) de cada elemento de `unidades`. */
  meses: number[];
}

export interface ParametrosReposicion {
  /** Semanas que tarda el proveedor en entregar. */
  leadSemanas: number;
  /** Semanas de ventas que se quiere cubrir con cada compra. */
  cicloSemanas: number;
  /** Fecha de hoy (inyectable para poder testear). */
  hoy: Date;
}

export interface Prediccion {
  nivelMensual: number;
  demandaSemanalProxima: number; // promedio de las próximas 4 semanas
  demandaLead: number;
  demandaHorizonte: number;
  sigmaSemanal: number;
  stockSeguridad: number;
  puntoReposicion: number;
  mesesConDatos: number;
}

export const media = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function desvio(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Índice estacional por mes calendario (12 valores, promedio ≈ 1).
 * Con menos de 12 meses de historia devuelve todo 1: no se inventa estacionalidad.
 * El suavizado `w = n/(n+1)` (n = años observados de ese mes) lo acerca a 1 cuando hay poca evidencia.
 */
export function indiceEstacional(serie: SerieMensual): { indice: number[]; confiable: boolean } {
  const neutro = Array(12).fill(1);
  if (serie.unidades.length < 12) return { indice: neutro, confiable: false };

  const total = media(serie.unidades);
  if (total <= 0) return { indice: neutro, confiable: false };

  const indice = neutro.map((_, mes) => {
    const obs = serie.unidades.filter((_, i) => serie.meses[i] === mes);
    if (!obs.length) return 1;
    const crudo = media(obs) / total;
    const w = obs.length / (obs.length + 1);
    return 1 + w * (crudo - 1);
  });
  // Normalizar para que el promedio sea exactamente 1.
  const k = media(indice);
  return { indice: indice.map((s) => s / k), confiable: true };
}

/** Pronóstico y parámetros de reposición de UN artículo. */
export function predecir(
  serie: SerieMensual,
  indice: number[],
  p: ParametrosReposicion,
): Prediccion {
  const des = serie.unidades.map((u, i) => u / (indice[serie.meses[i]] || 1));

  const ult = des.slice(-PESOS_NIVEL.length);
  const pesos = PESOS_NIVEL.slice(-ult.length);
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const nivelMensual = ult.reduce((a, d, i) => a + d * pesos[i], 0) / (sumaPesos || 1);

  // Demanda esperada de una semana que cae en el mes calendario `mes`.
  const demandaSemana = (mes: number) => (nivelMensual * indice[mes]) / SEMANAS_POR_MES;

  const suma = (desde: number, hasta: number) => {
    let acc = 0;
    for (let s = desde; s < hasta; s++) {
      const mitad = new Date(p.hoy.getTime() + (s + 0.5) * 7 * 86_400_000);
      acc += demandaSemana(mitad.getUTCMonth());
    }
    return acc;
  };

  const demandaLead = suma(0, p.leadSemanas);
  const demandaHorizonte = suma(0, p.leadSemanas + p.cicloSemanas);
  const demandaSemanalProxima = suma(0, 4) / 4;

  // Variabilidad: desvío de los últimos 12 meses desestacionalizados, pasado a escala semanal.
  const sigmaMensual = desvio(des.slice(-12));
  const sigmaSemanal = sigmaMensual / Math.sqrt(SEMANAS_POR_MES);
  const stockSeguridad = Z_SERVICIO * sigmaSemanal * Math.sqrt(Math.max(p.leadSemanas, 1));

  return {
    nivelMensual,
    demandaSemanalProxima,
    demandaLead,
    demandaHorizonte,
    sigmaSemanal,
    stockSeguridad,
    puntoReposicion: demandaLead + stockSeguridad,
    mesesConDatos: serie.unidades.filter((u) => u > 0).length,
  };
}

export type Urgencia = 'critico' | 'urgente' | 'ok' | 'sin_ventas';

export function clasificarUrgencia(stock: number, pred: Prediccion): Urgencia {
  if (pred.nivelMensual <= 0) return 'sin_ventas';
  if (stock < pred.demandaLead) return 'critico'; // se agota antes de que llegue la compra
  if (stock < pred.puntoReposicion) return 'urgente';
  return 'ok';
}

/** Cantidad sugerida, redondeada hacia arriba a bultos completos. */
export function cantidadSugerida(
  stock: number,
  pred: Prediccion,
  unidadesPorBulto: number,
): number {
  const faltante = pred.demandaHorizonte + pred.stockSeguridad - stock;
  if (faltante <= 0) return 0;
  const bulto = Math.max(unidadesPorBulto, 1);
  return Math.ceil(faltante / bulto) * bulto;
}

/** Clasificación ABC de Pareto: A = primer 80 % de las unidades, B = hasta 95 %, C = resto. */
export function clasificarABC(unidadesPorId: Map<number, number>): Map<number, 'A' | 'B' | 'C'> {
  const orden = [...unidadesPorId.entries()].sort((a, b) => b[1] - a[1]);
  const total = orden.reduce((a, [, u]) => a + u, 0);
  const res = new Map<number, 'A' | 'B' | 'C'>();
  let acum = 0;
  for (const [id, u] of orden) {
    const antes = total ? acum / total : 1; // cuánto llevaba acumulado ANTES de sumar éste
    res.set(id, u <= 0 ? 'C' : antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C');
    acum += u;
  }
  return res;
}
