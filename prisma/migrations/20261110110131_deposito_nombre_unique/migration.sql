/*
  Warnings:

  - A unique constraint covering the columns `[nombre]` on the table `Deposito` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Deposito_nombre_key" ON "Deposito"("nombre");
