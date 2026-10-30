-- CreateEnum
CREATE TYPE "Especie" AS ENUM ('PERRO', 'GATO');

-- AlterTable
ALTER TABLE "Articulo" ADD COLUMN     "especie" "Especie",
ADD COLUMN     "pesoGramos" INTEGER,
ADD COLUMN     "precioSugeridoPublico" DOUBLE PRECISION,
ADD COLUMN     "unidadesPorBulto" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "volumenCm3" INTEGER;

-- AlterTable
ALTER TABLE "DetallePedido" ADD COLUMN     "pesoUnitarioGramos" INTEGER;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "pesoGramos" INTEGER NOT NULL DEFAULT 0;
