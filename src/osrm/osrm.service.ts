import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Coord,
  OsrmRouteResponse,
  OsrmTableResponse,
  RouteResult,
  TableResult,
} from './osrm.types';
import {
  OSRM_DEFAULT_TIMEOUT_MS,
  OSRM_ERROR_MESSAGES,
  OSRM_RESPONSE_CODE,
} from './osrm.constants';

// ============================================================
// OsrmService — wrapper tipado sobre la API HTTP de OSRM.
//
// Expone dos métodos:
//   - table(coords): devuelve matrices N×N de duraciones y distancias.
//   - route(coords): devuelve la geometría GeoJSON + totales.
//
// No toca la base de datos. No conoce Envio ni Pedido.
// Es injectable en cualquier módulo NestJS que importe OsrmModule.
//
// El endpoint concreto (p. ej. http://osrm:5000) se lee de
// process.env.OSRM_URL vía ConfigService, con fallback a
// http://localhost:5000 para desarrollos fuera de Docker.
// ============================================================

@Injectable()
export class OsrmService {
  private readonly logger = new Logger(OsrmService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('OSRM_URL') ?? 'http://localhost:5000';
    this.baseUrl = url.replace(/\/+$/, ''); // sin trailing slash
  }

  // ------------------------------------------------------------
  // /table/v1/driving/{coords}?annotations=duration,distance
  // ------------------------------------------------------------
  // Devuelve la matriz N×N de duraciones (segundos) y distancias (metros)
  // entre todos los pares de coords. Índice 0 = origen, último = destino.
  //
  // row-major: durations[i][j] = tiempo de i hacia j.
  // La diagonal siempre es 0. La matriz no es simétrica (calles de sentido único).

  async table(coords: Coord[]): Promise<TableResult> {
    if (coords.length < 2) {
      throw new ServiceUnavailableException(OSRM_ERROR_MESSAGES.TOO_FEW_FOR_TABLE);
    }
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(OSRM_ERROR_MESSAGES.URL_MISSING);
    }

    const url = this.buildUrl('table', coords, {
      annotations: 'duration,distance',
    });

    const raw = await this.fetchJson<OsrmTableResponse>(url);

    // OSRM puede responder 200 con code != "Ok" cuando, p. ej., un punto
    // está demasiado lejos del grafo y no puede hacer snap.
    if (raw.code !== OSRM_RESPONSE_CODE.OK) {
      throw new ServiceUnavailableException(
        OSRM_ERROR_MESSAGES.BAD_RESPONSE_CODE(raw.code),
      );
    }

    if (!raw.durations || !raw.distances) {
      throw new ServiceUnavailableException(
        'OSRM respondió sin durations o distances. Revisá el parámetro annotations.',
      );
    }

    return {
      durations: raw.durations,
      distances: raw.distances,
    };
  }

  // ------------------------------------------------------------
  // /route/v1/driving/{coords}?geometries=geojson&overview=full
  // ------------------------------------------------------------
  // Devuelve la geometría de la ruta que pasa por las coords en orden.
  // El overview=full incluye TODOS los vértices (no simplifica) — importante
  // para que la línea dibujada en el mapa siga exactamente las calles.

  async route(coords: Coord[]): Promise<RouteResult> {
    if (coords.length < 2) {
      throw new ServiceUnavailableException(
        'El servicio /route requiere al menos 2 coordenadas.',
      );
    }
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(OSRM_ERROR_MESSAGES.URL_MISSING);
    }

    const url = this.buildUrl('route', coords, {
      geometries: 'geojson',
      overview: 'full',
    });

    const raw = await this.fetchJson<OsrmRouteResponse>(url);

    if (raw.code !== OSRM_RESPONSE_CODE.OK || !raw.routes?.length) {
      throw new ServiceUnavailableException(
        OSRM_ERROR_MESSAGES.BAD_RESPONSE_CODE(raw.code),
      );
    }

    const first = raw.routes[0];
    if (typeof first.geometry === 'string') {
      // Pedimos geometries=geojson, así que esto no debería pasar —
      // pero lo chequeamos por si el parámetro se pierde en algún redirect.
      throw new ServiceUnavailableException(
        'OSRM devolvió geometría como polyline en lugar de GeoJSON. ' +
        'Verificá el parámetro geometries=geojson.',
      );
    }

    return {
      geometry: first.geometry,
      distance: first.distance,
      duration: first.duration,
    };
  }

  // ------------------------------------------------------------
  // Helpers privados
  // ------------------------------------------------------------

  /** Construye la URL /service/v1/driving/lon,lat;lon,lat;...?key=val&... */
  private buildUrl(
    service: 'table' | 'route' | 'trip' | 'match' | 'nearest',
    coords: Coord[],
    params: Record<string, string> = {},
  ): string {
    const coordStr = coords.map(([lon, lat]) => `${lon},${lat}`).join(';');
    const qs = new URLSearchParams(params).toString();
    return `${this.baseUrl}/${service}/v1/driving/${coordStr}?${qs}`;
  }

  /** fetch con timeout + manejo de errores consistente. */
  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OSRM_DEFAULT_TIMEOUT_MS,
    );

    try {
      this.logger.debug(`OSRM → GET ${url}`);
      // Connection: close deshabilita HTTP keepalive. Sin esto, Node's fetch
      // (undici) reutiliza conexiones del pool. Si entre dos llamadas a OSRM
      // pasa ~10s (p. ej. mientras corre el solver), OSRM cierra la conexión
      // idle pero el pool la sigue considerando viva → la segunda llamada
      // falla instantáneamente con "fetch failed".
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Connection: 'close' },
      });

      if (!res.ok) {
        throw new ServiceUnavailableException(
          OSRM_ERROR_MESSAGES.BAD_STATUS(res.status),
        );
      }

      // OSRM siempre responde JSON con Content-Type application/json.
      // Si por alguna razón llega vacío o HTML, lo cazamos acá.
      const text = await res.text();
      if (!text) {
        throw new ServiceUnavailableException(OSRM_ERROR_MESSAGES.INVALID_JSON);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ServiceUnavailableException(OSRM_ERROR_MESSAGES.INVALID_JSON);
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;

      // AbortError → timeout
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ServiceUnavailableException(OSRM_ERROR_MESSAGES.TIMEOUT);
      }

      // fetch throws TypeError on DNS failure / connection refused.
      // El message genérico es "fetch failed" — el reason real está en err.cause.
      const cause = (err as Error & { cause?: Error }).cause;
      this.logger.error(
        `OSRM fetch failed: ${(err as Error).message}` +
        (cause ? ` (cause: ${cause.message})` : ''),
      );
      throw new ServiceUnavailableException(
        `No se pudo conectar con OSRM en ${this.baseUrl}. ¿Está levantado el contenedor?`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
