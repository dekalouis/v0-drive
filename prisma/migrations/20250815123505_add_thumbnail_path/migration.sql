/*
  Warnings:

  - The `captionVec` column on the `images` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "images" ADD COLUMN     "thumbnailPath" TEXT,
DROP COLUMN "captionVec",
ADD COLUMN     "captionVec" JSONB;
