-- CreateTable
CREATE TABLE "passReset" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fechaExpira" TIMESTAMP(3) NOT NULL,
    "expirado" BOOLEAN NOT NULL,

    CONSTRAINT "passReset_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "passReset" ADD CONSTRAINT "passReset_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
