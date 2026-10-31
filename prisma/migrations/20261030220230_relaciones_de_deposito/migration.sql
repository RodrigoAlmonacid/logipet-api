/*
  Warnings:

  - A unique constraint covering the columns `[operarioId]` on the table `Pedido` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DetallePedido" ADD COLUMN     "cantidadOriginal" INTEGER,
ADD COLUMN     "justificacionAjuste" TEXT,
ADD COLUMN     "verificado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "operarioId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_operarioId_key" ON "Pedido"("operarioId");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_operarioId_fkey" FOREIGN KEY ("operarioId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
