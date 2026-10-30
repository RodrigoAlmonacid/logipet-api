/*
  Warnings:

  - You are about to drop the column `comercio` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `direccion` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `horaAbreMat` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `horaAbreVesp` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `horaCierreMat` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `horaCierreVesp` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `latitud` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `longitud` on the `Cliente` table. All the data in the column will be lost.
  - Added the required column `auditorId` to the `EstadoPedido` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Cliente" DROP COLUMN "comercio",
DROP COLUMN "direccion",
DROP COLUMN "horaAbreMat",
DROP COLUMN "horaAbreVesp",
DROP COLUMN "horaCierreMat",
DROP COLUMN "horaCierreVesp",
DROP COLUMN "latitud",
DROP COLUMN "longitud";

-- AlterTable
ALTER TABLE "EstadoPedido" ADD COLUMN     "auditorId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Comercio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "horaAbreMat" TEXT NOT NULL,
    "horaAbreVesp" TEXT,
    "horaCierreMat" TEXT,
    "horaCierreVesp" TEXT NOT NULL,
    "duenioId" INTEGER NOT NULL,

    CONSTRAINT "Comercio_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Comercio" ADD CONSTRAINT "Comercio_duenioId_fkey" FOREIGN KEY ("duenioId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstadoPedido" ADD CONSTRAINT "EstadoPedido_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
