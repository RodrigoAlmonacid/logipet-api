import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { OsrmService } from './osrm.service';

// ============================================================
// Tests del OsrmService con fetch mockeado (Jest native ESM).
//
// Correr con:  docker compose exec api npm test   (== NODE_OPTIONS=--experimental-vm-modules jest)
//
// IMPORTANTE: en modo ESM nativo, Jest NO inyecta globals automáticamente.
// Por eso importamos { jest } explícitamente desde '@jest/globals'.
// (describe / it / expect / beforeEach / afterEach sí están disponibles
//  como globals, pero `jest.fn()` y `jest.restoreAllMocks()` requieren
//  el import explícito.)
//
// FIX HISTÓRICO (línea ~112): la aserción de URL usaba %2C (encoded)
// pero OSRM acepta comas literales en el PATH de la URL — las comas
// sólo se encodean en query strings, no en path segments. El test
// ahora verifica la URL con coma literal: '-68.0591,-38.9414'.
// ============================================================

const OSRM_URL = 'http://osrm-test:5000';

const validTableResponse = {
  code: 'Ok',
  durations: [
    [0, 100, 200],
    [110, 0, 150],
    [210, 160, 0],
  ],
  distances: [
    [0, 1000, 2000],
    [1100, 0, 1500],
    [2100, 1600, 0],
  ],
  sources: [],
  destinations: [],
};

const validRouteResponse = {
  code: 'Ok',
  routes: [
    {
      distance: 9723.3,
      duration: 985.1,
      weight: 4254.3,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-68.059245, -38.941399],
          [-68.059414, -38.959289],
          [-68.139162, -38.952537],
        ],
      },
      legs: [],
    },
  ],
  waypoints: [],
};

describe('OsrmService', () => {
  let service: OsrmService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(async () => {
    // Spy sobre globalThis.fetch y evitamos requests reales si falta mockear un caso
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Unmocked fetch call in test');
    });

    const configService = {
      get: (key: string) => (key === 'OSRM_URL' ? OSRM_URL : undefined),
    } as Partial<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OsrmService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(OsrmService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });


  // ------------------------------------------------------------
  // table()
  // ------------------------------------------------------------

  describe('table()', () => {
    it('devuelve durations y distances cuando OSRM responde Ok', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(validTableResponse), { status: 200 }),
      );

      const result = await service.table([
        [-68.0591, -38.9414],
        [-68.1393, -38.9521],
        [-68.1100, -38.9500],
      ]);

      expect(result.durations).toEqual(validTableResponse.durations);
      expect(result.distances).toEqual(validTableResponse.distances);

      // Verificamos que llamó al endpoint correcto con annotations=duration,distance
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/table/v1/driving/');
      expect(calledUrl).toContain('annotations=duration%2Cdistance'); // query string still encoded
      expect(calledUrl).toContain('-68.0591,-38.9414'); // path segment uses literal comma, not %2C
    });

    it('lanza ServiceUnavailableException si hay menos de 2 coords', async () => {
      await expect(service.table([[-68.0591, -38.9414]])).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lanza ServiceUnavailableException si OSRM responde code != Ok', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'InvalidUrl',
            message: 'URL string malformed',
          }),
          { status: 200 },
        ),
      );

      await expect(
        service.table([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('lanza ServiceUnavailableException si durations o distances faltan', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'Ok', durations: validTableResponse.durations }),
          { status: 200 },
        ),
      );

      await expect(
        service.table([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ------------------------------------------------------------
  // route()
  // ------------------------------------------------------------

  describe('route()', () => {
    it('devuelve geometry + distance + duration cuando OSRM responde Ok', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(validRouteResponse), { status: 200 }),
      );

      const result = await service.route([
        [-68.0591, -38.9414],
        [-68.1393, -38.9521],
      ]);

      expect(result.distance).toBe(9723.3);
      expect(result.duration).toBe(985.1);
      expect(result.geometry.type).toBe('LineString');
      expect(result.geometry.coordinates).toHaveLength(3);

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/route/v1/driving/');
      expect(calledUrl).toContain('geometries=geojson');
      expect(calledUrl).toContain('overview=full');
    });

    it('lanza ServiceUnavailableException si hay menos de 2 coords', async () => {
      await expect(service.route([[-68.0591, -38.9414]])).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lanza ServiceUnavailableException si OSRM devuelve geometry como string (polyline)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 1000,
                duration: 100,
                weight: 100,
                geometry: 'u`mzGz|h~L}_@', // polyline encoded
                legs: [],
              },
            ],
            waypoints: [],
          }),
          { status: 200 },
        ),
      );

      await expect(
        service.route([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ------------------------------------------------------------
  // Errores HTTP / red
  // ------------------------------------------------------------

  describe('manejo de errores', () => {
    it('lanza ServiceUnavailableException si OSRM responde 500', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(
        service.table([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('lanza ServiceUnavailableException si la respuesta no es JSON', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('<html>not json</html>', { status: 200 }),
      );

      await expect(
        service.table([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('lanza ServiceUnavailableException si fetch tira TypeError (connection refused)', async () => {
      fetchMock.mockRejectedValueOnce(
        new TypeError('fetch failed: Connection refused'),
      );

      await expect(
        service.table([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('lanza ServiceUnavailableException si fetch recibe AbortError (timeout)', async () => {
      fetchMock.mockImplementationOnce((_url: unknown, init: unknown) => {
        const reqInit = init as RequestInit;
        return new Promise((_resolve, reject) => {
          // El AbortController del OsrmService va a llamar a controller.abort()
          // después de 10s. Para no esperar, forzamos el abort apenas el test
          // registra el listener.
          const signal = reqInit?.signal as AbortSignal | undefined;
          if (signal && typeof signal.addEventListener === 'function') {
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
          // Disparamos el abort manualmente después de 10ms
          setTimeout(() => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }, 10);
        });
      });

      await expect(
        service.table([
          [-68.0591, -38.9414],
          [-68.1393, -38.9521],
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ------------------------------------------------------------
  // Caso real: datos del Neuquén (sanity check del formato)
  // ------------------------------------------------------------

  describe('integración real (data fixture)', () => {
    it('procesa correctamente la respuesta real de Neuquén que vimos en Batch 1', async () => {
      const realNeuquenRouteResponse = {
        code: 'Ok',
        routes: [
          {
            legs: [
              {
                steps: [],
                weight: 4254.3,
                summary: '',
                duration: 985.1,
                distance: 9723.3,
              },
            ],
            weight_name: 'routability',
            geometry: {
              coordinates: [
                [-68.059245, -38.941399],
                [-68.059414, -38.959289],
                [-68.121757, -38.959038],
                [-68.129274, -38.957975],
                [-68.13949, -38.957881],
                [-68.140107, -38.957528],
                [-68.140099, -38.954965],
                [-68.137991, -38.953616],
                [-68.139162, -38.952537],
              ],
              type: 'LineString',
            },
            weight: 4254.3,
            duration: 985.1,
            distance: 9723.3,
          },
        ],
        waypoints: [
          {
            hint: 'AAAA...',
            location: [-68.059245, -38.941399],
            name: 'Avenida Argentina',
            distance: 12.57456838,
          },
          {
            hint: 'AAAA...',
            location: [-68.139162, -38.952537],
            name: '',
            distance: 49.96573313,
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(realNeuquenRouteResponse), { status: 200 }),
      );

      const result = await service.route([
        [-68.0591, -38.9414],
        [-68.1393, -38.9521],
      ]);

      expect(result.distance).toBe(9723.3);
      expect(result.duration).toBe(985.1);
      expect(result.geometry.coordinates).toHaveLength(9);
      expect(result.geometry.coordinates[0]).toEqual([-68.059245, -38.941399]);
      expect(result.geometry.coordinates[8]).toEqual([-68.139162, -38.952537]);
    });
  });
});
