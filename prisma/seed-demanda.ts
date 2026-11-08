// Helpers para que el histórico sintético tenga estructura real de demanda:
// pocos productos de alta rotación (Pareto), estacionalidad por especie y stock coherente.
import { PrismaClient, Especie } from '@prisma/client';

// Índice por mes calendario (ene..dic). Gatos: pico en invierno. Perros: pico en verano.
const ESTACIONALIDAD: Record<Especie, number[]> = {
  GATO:  [0.85, 0.85, 0.95, 1.05, 1.15, 1.25, 1.3, 1.2, 1.05, 0.95, 0.9, 0.9],
  PERRO: [1.25, 1.2, 1.0, 0.9, 0.85, 0.8, 0.85, 0.9, 1.0, 1.05, 1.1, 1.2],
};

export const factorEstacional = (especie: Especie | null, mes: number) =>
  especie ? ESTACIONALIDAD[especie][mes] : 1;

/** Popularidad tipo Pareto: el artículo de rango r pesa 1/(r+1)^0.9. Orden estable por id. */
export function popularidad<T extends { id: number }>(articulos: T[]): Map<number, number> {
  const orden = [...articulos].sort((a, b) => ((a.id * 7919) % 1009) - ((b.id * 7919) % 1009));
  return new Map(orden.map((a, r) => [a.id, 1 / Math.pow(r + 1, 0.9)]));
}

/** Sorteo ponderado sin reposición de `n` artículos. */
export function elegirPonderados<T>(items: T[], pesos: number[], n: number, azar: () => number): T[] {
  const ids = items.map((_, i) => i);
  const w = [...pesos];
  const res: T[] = [];
  for (let k = 0; k < Math.min(n, items.length); k++) {
    const total = ids.reduce((a, i) => a + w[i], 0);
    let r = azar() * total;
    let elegido = ids[ids.length - 1];
    for (const i of ids) { r -= w[i]; if (r <= 0) { elegido = i; break; } }
    res.push(items[elegido]);
    ids.splice(ids.indexOf(elegido), 1);
  }
  return res;
}

/** Deja el stock actual entre 0,3 y 5 semanas de la demanda reciente: así hay críticos y sanos. */
export async function seedStockCoherente(prisma: PrismaClient) {
  const hace13 = new Date(Date.now() - 13 * 7 * 86_400_000);
  const lineas = await prisma.detallePedido.findMany({
    where: {
      pedido: {
        createdAt: { gte: hace13 },
        historialEstados: { some: { fechaFin: null, estado: { nombre: 'entregado' } } },
      },
    },
    select: { articuloId: true, cantidad: true },
  });
  const vendido = new Map<number, number>();
  for (const l of lineas) vendido.set(l.articuloId, (vendido.get(l.articuloId) ?? 0) + l.cantidad);

  const articulos = await prisma.articulo.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const a of articulos) {
    const semanal = (vendido.get(a.id) ?? 0) / 13;
    const semanas = 0.3 + Math.random() * 4.7;
    const stock = semanal > 0 ? Math.ceil(semanal * semanas) : Math.floor(Math.random() * 20);
    await prisma.articulo.update({ where: { id: a.id }, data: { stock } });
  }
  console.log('Stock ajustado a la demanda reciente');
}
