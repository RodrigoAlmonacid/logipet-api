/*
  Warnings:

  - You are about to drop the column `ubicacion` on the `Cliente` table. All the data in the column will be lost.
  - Added the required column `apellido` to the `Cliente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `comercio` to the `Cliente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `latitud` to the `Cliente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitud` to the `Cliente` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Cliente" DROP COLUMN "ubicacion",
ADD COLUMN     "apellido" TEXT NOT NULL,
ADD COLUMN     "comercio" TEXT NOT NULL,
ADD COLUMN     "latitud" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitud" DOUBLE PRECISION NOT NULL;
