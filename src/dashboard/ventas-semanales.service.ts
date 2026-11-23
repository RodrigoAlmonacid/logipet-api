import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import {
  Desglose, Metrica, PedidoVenta, armarSerie, rangoSemanas, resolverAcceso,
} from './ventas-semanales';

const METRICAS: Metrica[] = ['importe', 'pedidos', 'unidades'];
const DESGLOSES: Desglose[] = ['total', 'marca', 'especie', 'vendedor'];
const SEMANA_MS = 7 * 24 * 3600 * 1000;

@Injectable()
export class VentasSemanalesService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(user: AuthUser, q: { semanas?: string; metrica?: string; desglose?: string }, ahora = new Date()) {
    const acceso = resolverAcceso(user.permisos);
    if (!acceso) throw new ForbiddenException('No tenés permisos para ver las ventas');

    const cantidad = q.semanas === undefined ? 26 : Number(q.semanas);
    if (!Number.isInteger(cantidad) || cantidad < 4 || cantidad > 104) {
      throw new BadRequestException('semanas debe ser un entero entre 4 y 104');
    }
    const metrica = (q.metrica ?? (acceso.metricas.includes('importe') ? 'importe' : 'unidades')) as Metrica;
    const desglose = (q.desglose ?? 'total') as Desglose;
    if (!METRICAS.includes(metrica)) throw new BadRequestException('metrica inválida');
    if (!DESGLOSES.includes(desglose)) throw new BadRequestException('desglose inválido');
    if (!acceso.metricas.includes(metrica) || !acceso.desgloses.includes(desglose)) {
      throw new ForbiddenException('Tu rol no puede ver esa métrica o ese desglose');
    }

    const semanas = rangoSemanas(ahora, cantidad);
    const desde = semanas[0];
    const hasta = new Date(semanas[semanas.length - 1].getTime() + SEMANA_MS);

    const filas = await this.prisma.pedido.findMany({
      where: {
        ...(acceso.alcance === 'propios' ? { empleadoId: user.id } : {}),
        historialEstados: {
          some: { fechaFin: null, estado: { nombre: 'entregado' }, fechaCreac: { gte: desde, lt: hasta } },
        },
      },
      select: {
        id: true,
        empleado: { select: { id: true, nombre: true, apellido: true } },
        historialEstados: { where: { estado: { nombre: 'entregado' } }, select: { fechaCreac: true }, orderBy: { fechaCreac: 'desc' }, take: 1 },
        articulos: {
          select: {
            cantidad: true, precioVenta: true, alicuotaIvaPorcentaje: true, descuentoPorcentaje: true,
            articulo: { select: { especie: true, marca: { select: { nombre: true } } } },
          },
        },
      },
    });

    const pedidos: PedidoVenta[] = filas.map((f) => ({
      id: f.id,
      fecha: f.historialEstados[0].fechaCreac,
      vendedor: f.empleado,
      lineas: f.articulos.map((a) => ({
        cantidad: a.cantidad,
        precioVenta: a.precioVenta,
        alicuotaIvaPorcentaje: a.alicuotaIvaPorcentaje,
        descuentoPorcentaje: a.descuentoPorcentaje,
        marca: a.articulo.marca?.nombre ?? null,
        especie: a.articulo.especie,
      })),
    }));

    return {
      metrica,
      desglose,
      alcance: acceso.alcance,
      opciones: { metricas: acceso.metricas, desgloses: acceso.desgloses },
      ...armarSerie(pedidos, metrica, desglose, semanas),
    };
  }
}
