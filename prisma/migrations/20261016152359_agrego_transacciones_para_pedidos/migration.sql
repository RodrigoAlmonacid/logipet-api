-- CreateEnum
CREATE TYPE "MotivoBaja" AS ENUM ('ARREPENTIMIENTO', 'PRODUCTO_DANADO', 'CLIENTE_AUSENTE', 'CLIENTE_RECHAZO');

-- AlterTable
ALTER TABLE "EstadoPedido" ADD COLUMN     "motivo" "MotivoBaja",
ADD COLUMN     "observacion" TEXT;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "stockDescontado" BOOLEAN NOT NULL DEFAULT false;
