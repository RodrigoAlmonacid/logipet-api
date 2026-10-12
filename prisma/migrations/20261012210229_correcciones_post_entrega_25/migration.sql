/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AlicuotaIva` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `AlicuotaIva` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `AlicuotaIva` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AlicuotaIva" DROP COLUMN "createdAt",
DROP COLUMN "deletedAt",
DROP COLUMN "updatedAt";
