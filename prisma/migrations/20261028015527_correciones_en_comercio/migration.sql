/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Cliente` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Cliente_email_key" ON "Cliente"("email");
