-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "folderUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalImages" INTEGER NOT NULL DEFAULT 0,
    "processedImages" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "thumbnailLink" TEXT NOT NULL,
    "webViewLink" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "size" INTEGER,
    "md5Checksum" TEXT,
    "modifiedTime" TIMESTAMP(3),
    "etag" TEXT,
    "status" TEXT NOT NULL,
    "caption" TEXT,
    "tags" TEXT,
    "captionVec" REAL[],
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folders_folderId_key" ON "folders"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "images_fileId_key" ON "images"("fileId");

-- CreateIndex
CREATE INDEX "images_folderId_idx" ON "images"("folderId");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
