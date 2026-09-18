/*
  Warnings:

  - The primary key for the `_EmpleadoToEnvio` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_EmpleadoToRol` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_EmpleadoToEnvio` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_EmpleadoToRol` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "_EmpleadoToEnvio" DROP CONSTRAINT "_EmpleadoToEnvio_AB_pkey";

-- AlterTable
ALTER TABLE "_EmpleadoToRol" DROP CONSTRAINT "_EmpleadoToRol_AB_pkey";

-- CreateIndex
CREATE UNIQUE INDEX "_EmpleadoToEnvio_AB_unique" ON "_EmpleadoToEnvio"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_EmpleadoToRol_AB_unique" ON "_EmpleadoToRol"("A", "B");
