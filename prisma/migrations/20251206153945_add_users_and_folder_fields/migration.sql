/*
  Warnings:

  - You are about to drop the column `thumbnailPath` on the `images` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "name" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "images" DROP COLUMN "thumbnailPath";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
