/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `duenioId` on the `Comercio` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Comercio` table. All the data in the column will be lost.
  - Made the column `cuit` on table `Cliente` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `clienteId` to the `Comercio` table without a default value. This is not possible if the table is not empty.
  - Made the column `horaAbreVesp` on table `Comercio` required. This step will fail if there are existing NULL values in that column.
  - Made the column `horaCierreMat` on table `Comercio` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `comercioId` to the `Pedido` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Comercio" DROP CONSTRAINT "Comercio_duenioId_fkey";

-- DropForeignKey
ALTER TABLE "EstadoPedido" DROP CONSTRAINT "EstadoPedido_auditorId_fkey";

-- DropIndex
DROP INDEX "Cliente_email_key";

-- AlterTable
ALTER TABLE "Cliente" DROP COLUMN "createdAt",
DROP COLUMN "deletedAt",
DROP COLUMN "updatedAt",
ALTER COLUMN "cuit" SET NOT NULL;

-- AlterTable
ALTER TABLE "Comercio" DROP COLUMN "duenioId",
DROP COLUMN "email",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "clienteId" INTEGER NOT NULL,
ALTER COLUMN "horaAbreVesp" SET NOT NULL,
ALTER COLUMN "horaCierreMat" SET NOT NULL;

-- AlterTable
ALTER TABLE "EstadoPedido" ALTER COLUMN "auditorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "comercioId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Comercio_clienteId_idx" ON "Comercio"("clienteId");

-- AddForeignKey
ALTER TABLE "Comercio" ADD CONSTRAINT "Comercio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstadoPedido" ADD CONSTRAINT "EstadoPedido_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
