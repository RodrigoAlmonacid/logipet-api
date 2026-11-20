-- DropIndex
DROP INDEX "Pedido_envioId_ordenRuta_key";

-- CreateTable
CREATE TABLE "_CamionToPlanRuta" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CamionToPlanRuta_AB_unique" ON "_CamionToPlanRuta"("A", "B");

-- CreateIndex
CREATE INDEX "_CamionToPlanRuta_B_index" ON "_CamionToPlanRuta"("B");

-- CreateIndex
CREATE INDEX "Pedido_envioId_idx" ON "Pedido"("envioId");

-- AddForeignKey
ALTER TABLE "_CamionToPlanRuta" ADD CONSTRAINT "_CamionToPlanRuta_A_fkey" FOREIGN KEY ("A") REFERENCES "Camion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CamionToPlanRuta" ADD CONSTRAINT "_CamionToPlanRuta_B_fkey" FOREIGN KEY ("B") REFERENCES "PlanRuta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
