import { Worker, type Job } from "bullmq"
import IORedis from "ioredis"
import { prisma } from "@/lib/prisma"
import { captionImage, generateCaptionEmbedding, geminiRateLimiter } from "@/lib/gemini"
import type { FolderJobData, ImageJobData } from "@/lib/queue"

// Redis connection for workers
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

// Folder processing worker
export const folderWorker = new Worker(
  "folders",
  async (job: Job<FolderJobData>) => {
    const { folderId, googleFolderId } = job.data

    console.log(`Processing folder: ${googleFolderId}`)

    try {
      // Update folder status to processing
      await prisma.folder.update({
        where: { id: folderId },
        data: { status: "processing" },
      })

      // Get all pending images for this folder
      const images = await prisma.image.findMany({
        where: {
          folderId,
          status: "pending",
        },
        select: {
          id: true,
          fileId: true,
          etag: true,
        },
      })

      console.log(`Found ${images.length} images to process for folder ${googleFolderId}`)

      // Queue image captioning jobs
      const { queueImageCaptioning } = await import("@/lib/queue")

      for (const image of images) {
        await queueImageCaptioning(image.id, image.fileId, image.etag || "unknown", folderId)
      }

      console.log(`Queued ${images.length} image captioning jobs for folder ${googleFolderId}`)

      // Check if all images are already processed
      const totalImages = await prisma.image.count({
        where: { folderId },
      })

      const processedImages = await prisma.image.count({
        where: { folderId, status: "completed" },
      })

      if (processedImages === totalImages) {
        await prisma.folder.update({
          where: { id: folderId },
          data: { status: "completed" },
        })
      }

      return { success: true, queuedImages: images.length }
    } catch (error) {
      console.error(`Folder processing failed for ${googleFolderId}:`, error)

      await prisma.folder.update({
        where: { id: folderId },
        data: { status: "failed" },
      })

      throw error
    }
  },
  {
    connection,
    concurrency: 2, // Process 2 folders concurrently
  },
)

// Image captioning worker
export const imageWorker = new Worker(
  "images",
  async (job: Job<ImageJobData>) => {
    const { imageId, fileId, etag, folderId } = job.data

    console.log(`Processing image: ${fileId}`)

    try {
      // Update image status to processing
      await prisma.image.update({
        where: { id: imageId },
        data: { status: "processing" },
      })

      // Get image details
      const image = await prisma.image.findUnique({
        where: { id: imageId },
        select: { mimeType: true, name: true },
      })

      if (!image) {
        throw new Error("Image not found")
      }

      // Rate limiting
      await geminiRateLimiter.waitIfNeeded()

      // Generate caption and tags using Gemini
      const { caption, tags } = await captionImage(fileId, image.mimeType)

      console.log(`Generated caption for ${image.name}: ${caption.substring(0, 100)}...`)

      // Generate embedding for the caption
      const embedding = await generateCaptionEmbedding(caption, tags)

      // Update image with results
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "completed",
          caption,
          tags: tags.join(","),
          captionVec: embedding,
        },
      })

      // Update folder progress
      await updateFolderProgress(folderId)

      console.log(`Completed processing image: ${fileId}`)

      return { success: true, imageId, fileId, caption: caption.substring(0, 100) }
    } catch (error) {
      console.error(`Image processing failed for ${fileId}:`, error)

      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })

      // Still update folder progress even on failure
      await updateFolderProgress(folderId)

      throw error
    }
  },
  {
    connection,
    concurrency: 2, // Reduced concurrency for AI processing
  },
)

// Helper function to update folder progress
async function updateFolderProgress(folderId: string) {
  const [totalImages, processedImages] = await Promise.all([
    prisma.image.count({
      where: { folderId },
    }),
    prisma.image.count({
      where: { folderId, status: "completed" },
    }),
  ])

  const status = processedImages === totalImages ? "completed" : "processing"

  await prisma.folder.update({
    where: { id: folderId },
    data: {
      processedImages,
      status,
    },
  })

  console.log(`Updated folder progress: ${processedImages}/${totalImages} (${status})`)
}

// Worker event handlers
folderWorker.on("completed", (job) => {
  console.log(`Folder job ${job.id} completed`)
})

folderWorker.on("failed", (job, err) => {
  console.error(`Folder job ${job?.id} failed:`, err)
})

imageWorker.on("completed", (job) => {
  console.log(`Image job ${job.id} completed`)
})

imageWorker.on("failed", (job, err) => {
  console.error(`Image job ${job?.id} failed:`, err)
})

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down workers...")
  await Promise.all([folderWorker.close(), imageWorker.close()])
  process.exit(0)
})
