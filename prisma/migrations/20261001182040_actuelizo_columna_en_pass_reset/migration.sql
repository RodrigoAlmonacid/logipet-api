/*
  Warnings:

  - You are about to drop the column `expirado` on the `PassReset` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PassReset" DROP CONSTRAINT "PassReset_empleadoId_fkey";

-- AlterTable
ALTER TABLE "PassReset" DROP COLUMN "expirado",
ADD COLUMN     "usado" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "PassReset" ADD CONSTRAINT "PassReset_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
