import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Estados que cuentan como venta concretada. Ajustalo al nombre real del estado
// final en tu tabla Estado (el mismo que usa el seed).
const ESTADOS_VENTA = ['entregado'];

// El promedio semanal se calcula con las unidades vendidas en las últimas N semanas.
const SEMANAS_VENTANA = 4;
const MS_SEMANA = 7 * 24 * 60 * 60 * 1000;
// Stock ideal = 2 semanas de ventas. Se alerta cuando el stock cae por debajo de este % del ideal.
const UMBRAL_ALERTA = 0.3;
// En la torta se muestran las N marcas con más unidades; el resto se agrupa en "Otras".
const MAX_MARCAS = 5;
const TOP_COMERCIOS = 5;

// Solo se traen los campos que hacen falta para las métricas, nada de datos personales de clientes.
const SELECT_VENTA = {
  id: true,
  importe: true,
  createdAt: true,
  empleadoId: true,
  empleado: { select: { nombre: true, apellido: true } },
  comercioId: true,
  comercio: { select: { nombre: true } },
  articulos: {
    select: {
      articuloId: true,
      cantidad: true,
      articulo: { select: { marca: { select: { nombre: true } } } },
    },
  },
} satisfies Prisma.PedidoSelect;

type PedidoVenta = Prisma.PedidoGetPayload<{ select: typeof SELECT_VENTA }>;

export interface ResumenVentas {
  mejorVenta: { id: number; importe: number; comercio: string };
  topFacturacion: { nombre: string; total: number };
  topVariedad: { nombre: string; distintos: number };
  mejoresComercios: { comercio: string; total: number }[];
  marcas: { nombre: string; unidades: number }[];
}

export interface AlertaStock {
  id: number;
  nombre: string;
  presentacion: string;
  stock: number;
  ventasPromedioSemanal: number;
  stockIdeal: number;
}

export interface ResumenDashboard {
  ventas: ResumenVentas | null;
  alertasStock: AlertaStock[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen(): Promise<ResumenDashboard> {
    const [pedidos, articulos] = await Promise.all([
      this.prisma.pedido.findMany({
        where: {
          // mismo criterio de "estado actual" que usa PedidoService.findAll
          historialEstados: { some: { fechaFin: null, estado: { nombre: { in: ESTADOS_VENTA } } } },
        },
        select: SELECT_VENTA,
      }),
      this.prisma.articulo.findMany({
        where: { deletedAt: null },
        select: { id: true, nombre: true, presentacion: true, stock: true },
      }),
    ]);

    return {
      ventas: this.resumirVentas(pedidos),
      alertasStock: this.alertasStock(pedidos, articulos),
    };
  }

  private resumirVentas(pedidos: PedidoVenta[]): ResumenVentas | null {
    if (!pedidos.length) {
      return null;
    }

    const vendedores = new Map<number, { nombre: string; total: number; articulos: Set<number> }>();
    const comercios = new Map<number, { comercio: string; total: number }>();
    const porMarca = new Map<string, number>();

    for (const ped of pedidos) {
      const vendedor = vendedores.get(ped.empleadoId) ?? {
        nombre: `${ped.empleado.nombre} ${ped.empleado.apellido}`,
        total: 0,
        articulos: new Set<number>(),
      };
      vendedor.total += ped.importe;
      vendedores.set(ped.empleadoId, vendedor);

      const claveComercio = ped.comercioId ?? 0;
      const comercio = comercios.get(claveComercio) ?? {
        comercio: ped.comercio?.nombre ?? 'Sin comercio',
        total: 0,
      };
      comercio.total += ped.importe;
      comercios.set(claveComercio, comercio);

      for (const d of ped.articulos) {
        vendedor.articulos.add(d.articuloId);
        const marca = d.articulo.marca?.nombre ?? 'Sin marca';
        porMarca.set(marca, (porMarca.get(marca) ?? 0) + d.cantidad);
      }
    }

    const listaVendedores = [...vendedores.values()];
    const topFacturacion = [...listaVendedores].sort((a, b) => b.total - a.total)[0];
    // ante empate en variedad, gana el que más facturó
    const topVariedad = [...listaVendedores].sort(
      (a, b) => b.articulos.size - a.articulos.size || b.total - a.total,
    )[0];

    const ordenadas = [...porMarca.entries()]
      .map(([nombre, unidades]) => ({ nombre, unidades }))
      .sort((a, b) => b.unidades - a.unidades);
    const marcas = ordenadas.slice(0, MAX_MARCAS);
    const resto = ordenadas.slice(MAX_MARCAS).reduce((acc, m) => acc + m.unidades, 0);
    if (resto > 0) {
      marcas.push({ nombre: 'Otras', unidades: resto });
    }

    const mejor = pedidos.reduce((a, b) => (b.importe > a.importe ? b : a));

    return {
      mejorVenta: { id: mejor.id, importe: mejor.importe, comercio: mejor.comercio?.nombre ?? 'Sin comercio' },
      topFacturacion: { nombre: topFacturacion.nombre, total: topFacturacion.total },
      topVariedad: { nombre: topVariedad.nombre, distintos: topVariedad.articulos.size },
      mejoresComercios: [...comercios.values()].sort((a, b) => b.total - a.total).slice(0, TOP_COMERCIOS),
      marcas,
    };
  }

  private alertasStock(
    pedidos: PedidoVenta[],
    articulos: { id: number; nombre: string; presentacion: string; stock: number }[],
  ): AlertaStock[] {
    const desde = Date.now() - SEMANAS_VENTANA * MS_SEMANA;
    const vendidas = new Map<number, number>();

    for (const ped of pedidos) {
      if (ped.createdAt.getTime() < desde) {
        continue;
      }
      for (const d of ped.articulos) {
        vendidas.set(d.articuloId, (vendidas.get(d.articuloId) ?? 0) + d.cantidad);
      }
    }

    return articulos
      .map((a) => {
        const ventasPromedioSemanal = Math.ceil((vendidas.get(a.id) ?? 0) / SEMANAS_VENTANA);
        return { ...a, ventasPromedioSemanal, stockIdeal: ventasPromedioSemanal * 2 };
      })
      // sin ventas recientes no hay nada que reponer
      .filter((a) => a.ventasPromedioSemanal > 0 && a.stock <= a.stockIdeal * UMBRAL_ALERTA)
      .sort((a, b) => a.stock - b.stock);
  }
}