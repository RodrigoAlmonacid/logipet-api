import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DepositoService } from './deposito.service';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// Tests del DepositoService con PrismaService mockeado.
//
// Correr con:  docker compose exec api npm test -- src/deposito
//
// Patrón: mockeamos PrismaService con jest.fn() para cada método
// que usa el servicio (findUnique, findMany, create, update, count).
// Usamos el patrón spy de Batch 3: si un método no se mockea para
// un test, falla con "Unmocked method call".
//
// NO usamos DB real — estos tests son unitarios, no de integración.
// La integración con Prisma/Postgres se valida en Batch 5 con
// un smoke test contra el container real.
// ============================================================

type PrismaMock = {
  deposito: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  planRuta: {
    count: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock & Partial<PrismaService> {
  const mock: PrismaMock = {
    deposito: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    planRuta: {
      count: jest.fn(),
    },
  };
  // Por seguridad: si algún test olvida mockear, falla explícitamente
  // en vez de devolver undefined silenciosamente.
  return mock as unknown as PrismaMock & Partial<PrismaService>;
}

const SAMPLE_DEPOSITO = {
  id: 1,
  nombre: 'Depósito Central Neuquén',
  direccion: 'Av. Argentina 800, Neuquén',
  latitud: -38.9517,
  longitud: -68.0626,
  horaApertura: '08:00',
  horaCierre: '18:00',
  activo: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('DepositoService', () => {
  let service: DepositoService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DepositoService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------
  // create()
  // ------------------------------------------------------------

  describe('create()', () => {
    const createDto = {
      nombre: 'Nuevo Depósito',
      direccion: 'Ruta 22 km 1285',
      latitud: -38.93,
      longitud: -68.10,
      horaApertura: '08:00',
      horaCierre: '18:00',
    };

    it('crea un depósito cuando el nombre no existe', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(null); // no existe
      prisma.deposito.create.mockResolvedValueOnce({
        ...SAMPLE_DEPOSITO,
        ...createDto,
        id: 99,
      });

      const result = await service.create(createDto);

      expect(result.id).toBe(99);
      expect(result.nombre).toBe(createDto.nombre);
      expect(prisma.deposito.findUnique).toHaveBeenCalledWith({
        where: { nombre: createDto.nombre },
      });
      expect(prisma.deposito.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nombre: createDto.nombre,
          activo: true, // default
        }),
        select: expect.any(Object),
      });
    });

    it('lanza ConflictException si ya existe un depósito con ese nombre', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(SAMPLE_DEPOSITO);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(prisma.deposito.create).not.toHaveBeenCalled();
    });

    it('respects explicit activo=false in DTO', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(null);
      prisma.deposito.create.mockResolvedValueOnce({
        ...SAMPLE_DEPOSITO,
        activo: false,
      });

      await service.create({ ...createDto, activo: false });

      expect(prisma.deposito.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ activo: false }),
        select: expect.any(Object),
      });
    });
  });

  // ------------------------------------------------------------
  // findAll()
  // ------------------------------------------------------------

  describe('findAll()', () => {
    it('devuelve todos los depósitos no borrados ordenados por nombre', async () => {
      const depositos = [SAMPLE_DEPOSITO, { ...SAMPLE_DEPOSITO, id: 2, nombre: 'Otro' }];
      prisma.deposito.findMany.mockResolvedValueOnce(depositos);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(prisma.deposito.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: expect.any(Object),
        orderBy: [{ nombre: 'asc' }],
      });
    });
  });

  // ------------------------------------------------------------
  // findActivos()
  // ------------------------------------------------------------

  describe('findActivos()', () => {
    it('filtra por activo=true y deletedAt=null', async () => {
      prisma.deposito.findMany.mockResolvedValueOnce([SAMPLE_DEPOSITO]);

      const result = await service.findActivos();

      expect(result).toHaveLength(1);
      expect(prisma.deposito.findMany).toHaveBeenCalledWith({
        where: { activo: true, deletedAt: null },
        select: expect.any(Object),
        orderBy: [{ nombre: 'asc' }],
      });
    });
  });

  // ------------------------------------------------------------
  // findOne()
  // ------------------------------------------------------------

  describe('findOne()', () => {
    it('devuelve el depósito cuando existe', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(SAMPLE_DEPOSITO);

      const result = await service.findOne(1);

      expect(result).toEqual(SAMPLE_DEPOSITO);
      expect(prisma.deposito.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });

    it('lanza NotFoundException cuando no existe', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ------------------------------------------------------------
  // update()
  // ------------------------------------------------------------

  describe('update()', () => {
    it('actualiza campos provistos', async () => {
      prisma.deposito.findUnique
        .mockResolvedValueOnce(SAMPLE_DEPOSITO)  // findOne
        .mockResolvedValueOnce(null);            // validarUnicoNombre (no existe otro)
      prisma.deposito.update.mockResolvedValueOnce({
        ...SAMPLE_DEPOSITO,
        direccion: 'Nueva dirección 123',
      });

      const result = await service.update(1, { direccion: 'Nueva dirección 123' });

      expect(result.direccion).toBe('Nueva dirección 123');
      expect(prisma.deposito.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          direccion: 'Nueva dirección 123',
          updatedAt: expect.any(Date),
        }),
        select: expect.any(Object),
      });
    });

    it('no actualiza campos que no están en el DTO', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(SAMPLE_DEPOSITO);
      prisma.deposito.update.mockResolvedValueOnce(SAMPLE_DEPOSITO);

      await service.update(1, { activo: false });

      const updateCall = prisma.deposito.update.mock.calls[0][0];
      expect(updateCall.data).toHaveProperty('activo', false);
      expect(updateCall.data).not.toHaveProperty('nombre');
      expect(updateCall.data).not.toHaveProperty('direccion');
    });

    it('lanza ConflictException si el nuevo nombre ya existe en otro depósito', async () => {
      prisma.deposito.findUnique
        .mockResolvedValueOnce(SAMPLE_DEPOSITO)             // findOne
        .mockResolvedValueOnce({ ...SAMPLE_DEPOSITO, id: 2 }); // otro con ese nombre

      await expect(
        service.update(1, { nombre: 'Depósito Existente' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.deposito.update).not.toHaveBeenCalled();
    });

    it('permite actualizar al mismo nombre (excludeId)', async () => {
      prisma.deposito.findUnique
        .mockResolvedValueOnce(SAMPLE_DEPOSITO)  // findOne
        .mockResolvedValueOnce(SAMPLE_DEPOSITO); // el mismo registro — no conflict
      prisma.deposito.update.mockResolvedValueOnce(SAMPLE_DEPOSITO);

      await expect(
        service.update(1, { nombre: SAMPLE_DEPOSITO.nombre }),
      ).resolves.toBeDefined();
    });

    it('lanza NotFoundException si el depósito no existe', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(null);

      await expect(service.update(999, { activo: false })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------------
  // remove() (soft delete)
  // ------------------------------------------------------------

  describe('remove()', () => {
    it('hace soft delete cuando no hay PlanRutas activas', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(SAMPLE_DEPOSITO);
      prisma.planRuta.count.mockResolvedValueOnce(0);
      prisma.deposito.update.mockResolvedValueOnce({
        ...SAMPLE_DEPOSITO,
        activo: false,
      });

      const result = await service.remove(1);

      expect(result).toEqual({ message: 'Depósito dado de baja' });
      expect(prisma.deposito.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          activo: false,
          deletedAt: expect.any(Date),
        }),
      });
    });

    it('lanza BadRequestException si hay PlanRutas activas referenciando al depósito', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(SAMPLE_DEPOSITO);
      prisma.planRuta.count.mockResolvedValueOnce(3);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(prisma.deposito.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el depósito no existe', async () => {
      prisma.deposito.findUnique.mockResolvedValueOnce(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
