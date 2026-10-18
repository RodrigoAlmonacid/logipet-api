-- AlterTable
ALTER TABLE "DetallePedido" ADD COLUMN     "alicuotaIvaPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "descuentoPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0;
