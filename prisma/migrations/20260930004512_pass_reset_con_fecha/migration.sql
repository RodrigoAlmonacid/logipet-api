/*
  Warnings:

  - You are about to drop the `passReset` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "passReset" DROP CONSTRAINT "passReset_empleadoId_fkey";

-- DropTable
DROP TABLE "passReset";

-- CreateTable
CREATE TABLE "PassReset" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fechaExpira" TIMESTAMP(3) NOT NULL,
    "expirado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreac" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PassReset_tokenHash_key" ON "PassReset"("tokenHash");

-- AddForeignKey
ALTER TABLE "PassReset" ADD CONSTRAINT "PassReset_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
