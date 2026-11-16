import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prediccion,
  SerieMensual,
  Urgencia,
  cantidadSugerida,
  clasificarABC,
  clasificarUrgencia,
  indiceEstacional,
  predecir,
} from './estadistica';

const ESTADOS_VENTA = ['entregado']; // misma regla que el dashboard
const MESES_HISTORIA = 24;
const LEAD_SEMANAS = Number(process.env.REPOSICION_LEAD_SEMANAS ?? 2);
const CICLO_SEMANAS = Number(process.env.REPOSICION_CICLO_SEMANAS ?? 4);

const ORDEN_URGENCIA: Record<Urgencia, number> = { critico: 0, urgente: 1, ok: 2, sin_ventas: 3 };

export interface ItemReposicion {
  id: number;
  codigo: string;
  nombre: string;
  presentacion: string;
  marca: string | null;
  stock: number;
  abc: 'A' | 'B' | 'C';
  urgencia: Urgencia;
  demandaSemanal: number; // pronóstico próximas 4 semanas
  coberturaSemanas: number | null; // stock / demandaSemanal
  stockSeguridad: number;
  puntoReposicion: number;
  cantidadSugerida: number;
  mesesConDatos: number;
}

export interface ResumenReposicion {
  generadoEn: string;
  parametros: { leadSemanas: number; cicloSemanas: number; nivelServicio: number };
  /** false si hay menos de 12 meses de historia: no se aplicó estacionalidad. */
  estacionalidadConfiable: boolean;
  /** Índice por mes calendario (ene..dic) y por especie, para graficar. */
  estacionalidad: Record<string, number[]>;
  items: ItemReposicion[];
}

@Injectable()
export class ReabastecimientoService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen(hoy = new Date()): Promise<ResumenReposicion> {
    // Meses COMPLETOS: se excluye el mes en curso porque sesgaría el nivel hacia abajo.
    const inicioMesActual = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1);
    const meses: { anio: number; mes: number }[] = [];
    for (let k = MESES_HISTORIA; k >= 1; k--) {
      const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - k, 1));
      meses.push({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() });
    }
    const desde = new Date(Date.UTC(meses[0].anio, meses[0].mes, 1));

    const [lineas, articulos] = await Promise.all([
      this.prisma.detallePedido.findMany({
        where: {
          pedido: {
            createdAt: { gte: desde, lt: new Date(inicioMesActual) },
            historialEstados: {
              some: { fechaFin: null, estado: { nombre: { in: ESTADOS_VENTA } } },
            },
          },
        },
        select: { articuloId: true, cantidad: true, pedido: { select: { createdAt: true } } },
      }),
      this.prisma.articulo.findMany({
        where: { deletedAt: null },
        select: {
          id: true, codigo: true, nombre: true, presentacion: true, stock: true,
          especie: true, unidadesPorBulto: true, marca: { select: { nombre: true } },
        },
      }),
    ]);

    // Unidades por artículo y mes (posición 0 = mes más viejo).
    const posicion = new Map(meses.map((m, i) => [`${m.anio}-${m.mes}`, i]));
    const porArticulo = new Map<number, number[]>();
    for (const l of lineas) {
      const f = l.pedido.createdAt;
      const i = posicion.get(`${f.getUTCFullYear()}-${f.getUTCMonth()}`);
      if (i === undefined) continue;
      const serie = porArticulo.get(l.articuloId) ?? Array(meses.length).fill(0);
      serie[i] += l.cantidad;
      porArticulo.set(l.articuloId, serie);
    }

    // Índice estacional por especie (agrupa artículos: por artículo suelto sería puro ruido).
    const mesesCal = meses.map((m) => m.mes);
    const grupos = new Map<string, number[]>();
    for (const a of articulos) {
      const g = a.especie ?? 'OTRO';
      const acc = grupos.get(g) ?? Array(meses.length).fill(0);
      (porArticulo.get(a.id) ?? []).forEach((u, i) => (acc[i] += u));
      grupos.set(g, acc);
    }
    const indices = new Map<string, number[]>();
    let confiable = false;
    for (const [g, unidades] of grupos) {
      const r = indiceEstacional({ unidades, meses: mesesCal });
      indices.set(g, r.indice);
      confiable ||= r.confiable;
    }

    // ABC sobre los últimos 12 meses.
    const ultimos12 = new Map<number, number>(
      articulos.map((a) => [a.id, (porArticulo.get(a.id) ?? []).slice(-12).reduce((x, y) => x + y, 0)]),
    );
    const abc = clasificarABC(ultimos12);

    const items: ItemReposicion[] = articulos.map((a) => {
      const serie: SerieMensual = {
        unidades: porArticulo.get(a.id) ?? Array(meses.length).fill(0),
        meses: mesesCal,
      };
      const pred: Prediccion = predecir(serie, indices.get(a.especie ?? 'OTRO')!, {
        leadSemanas: LEAD_SEMANAS,
        cicloSemanas: CICLO_SEMANAS,
        hoy,
      });
      const redondeo = (n: number) => Math.round(n * 10) / 10;
      return {
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        presentacion: a.presentacion,
        marca: a.marca?.nombre ?? null,
        stock: a.stock,
        abc: abc.get(a.id) ?? 'C',
        urgencia: clasificarUrgencia(a.stock, pred),
        demandaSemanal: redondeo(pred.demandaSemanalProxima),
        coberturaSemanas:
          pred.demandaSemanalProxima > 0 ? redondeo(a.stock / pred.demandaSemanalProxima) : null,
        stockSeguridad: Math.ceil(pred.stockSeguridad),
        puntoReposicion: Math.ceil(pred.puntoReposicion),
        cantidadSugerida: cantidadSugerida(a.stock, pred, a.unidadesPorBulto),
        mesesConDatos: pred.mesesConDatos,
      };
    });

    // Primero lo más urgente; dentro de cada nivel, los de alta demanda (A) arriba.
    items.sort(
      (x, y) =>
        ORDEN_URGENCIA[x.urgencia] - ORDEN_URGENCIA[y.urgencia] ||
        x.abc.localeCompare(y.abc) ||
        (x.coberturaSemanas ?? Infinity) - (y.coberturaSemanas ?? Infinity),
    );

    return {
      generadoEn: hoy.toISOString(),
      parametros: { leadSemanas: LEAD_SEMANAS, cicloSemanas: CICLO_SEMANAS, nivelServicio: 0.95 },
      estacionalidadConfiable: confiable,
      estacionalidad: Object.fromEntries(
        [...indices].map(([g, idx]) => [g, idx.map((v) => Math.round(v * 100) / 100)]),
      ),
      items,
    };
  }
}
