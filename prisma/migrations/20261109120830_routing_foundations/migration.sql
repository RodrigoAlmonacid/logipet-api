/*
  Warnings:

  - A unique constraint covering the columns `[envioId,ordenRuta]` on the table `Pedido` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Camion" ADD COLUMN     "capacidadVolumen" DOUBLE PRECISION,
ADD COLUMN     "disponible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Comercio" ADD COLUMN     "tiempoServicioMin" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Envio" ADD COLUMN     "distanciaMetros" DOUBLE PRECISION,
ADD COLUMN     "duracionSegundos" INTEGER,
ADD COLUMN     "optimizadoAt" TIMESTAMP(3),
ADD COLUMN     "planRutaId" INTEGER,
ADD COLUMN     "rutaOptima" JSONB;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "llegadaEstimada" TIMESTAMP(3),
ADD COLUMN     "ordenRuta" INTEGER;

-- CreateTable
CREATE TABLE "Deposito" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "horaApertura" TEXT NOT NULL,
    "horaCierre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRuta" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "depositoId" INTEGER NOT NULL,
    "horaLimite" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanRuta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deposito_activo_idx" ON "Deposito"("activo");

-- CreateIndex
CREATE INDEX "PlanRuta_depositoId_idx" ON "PlanRuta"("depositoId");

-- CreateIndex
CREATE INDEX "PlanRuta_fecha_idx" ON "PlanRuta"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_envioId_ordenRuta_key" ON "Pedido"("envioId", "ordenRuta");

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_planRutaId_fkey" FOREIGN KEY ("planRutaId") REFERENCES "PlanRuta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRuta" ADD CONSTRAINT "PlanRuta_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
