/*
  Warnings:

  - A unique constraint covering the columns `[cuil]` on the table `Empleado` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CondicionIva" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL');

-- AlterTable
ALTER TABLE "Articulo" ADD COLUMN     "alicuotaIvaId" INTEGER;

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "condicionIva" "CondicionIva" NOT NULL DEFAULT 'CONSUMIDOR_FINAL',
ADD COLUMN     "cuit" TEXT;

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "cuil" TEXT;

-- CreateTable
CREATE TABLE "AlicuotaIva" (
    "id" SERIAL NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "codigoAfip" INTEGER NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "AlicuotaIva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlicuotaIva_porcentaje_key" ON "AlicuotaIva"("porcentaje");

-- CreateIndex
CREATE UNIQUE INDEX "AlicuotaIva_codigoAfip_key" ON "AlicuotaIva"("codigoAfip");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_cuil_key" ON "Empleado"("cuil");

-- AddForeignKey
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_alicuotaIvaId_fkey" FOREIGN KEY ("alicuotaIvaId") REFERENCES "AlicuotaIva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
