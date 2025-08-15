import { Worker, type Job } from "bullmq"
import IORedis from "ioredis"
import { prisma } from "@/lib/prisma"
import { captionImage, generateCaptionEmbedding, geminiRateLimiter } from "@/lib/gemini"
import type { FolderJobData, ImageJobData } from "@/lib/queue"

// Redis connection for workers
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

// Add connection event logging
connection.on("connect", () => {
  console.log("🔗 Worker Redis connected successfully")
})

connection.on("error", (error) => {
  console.error("❌ Worker Redis connection error:", error)
})

connection.on("ready", () => {
  console.log("✅ Worker Redis ready for operations")
})

// Progress tracking for folders
const folderProgress = new Map<string, { startTime: number; totalImages: number; processedImages: number }>()

// Export progress tracking for external monitoring
export function getFolderProgress() {
  const progress = Array.from(folderProgress.entries()).map(([folderId, data]) => {
    const elapsedTime = Date.now() - data.startTime
    const imagesPerMinute = data.processedImages > 0 ? (data.processedImages / (elapsedTime / 60000)) : 0
    const avgTimePerImage = data.processedImages > 0 ? elapsedTime / data.processedImages : 0
    const remainingImages = data.totalImages - data.processedImages
    const estimatedTimeRemaining = remainingImages * avgTimePerImage
    const progressPercent = Math.round((data.processedImages / data.totalImages) * 100)

    return {
      folderId,
      totalImages: data.totalImages,
      processedImages: data.processedImages,
      progressPercent,
      elapsedTime: Math.round(elapsedTime / 1000),
      imagesPerMinute: Math.round(imagesPerMinute),
      avgTimePerImage: Math.round(avgTimePerImage),
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining / 1000),
      startTime: new Date(data.startTime).toISOString(),
    }
  })

  return progress
}

// Get overall processing statistics
export async function getProcessingStats() {
  const progress = getFolderProgress()
  
  // Get queue statistics
  const { getQueueStats } = await import("@/lib/queue")
  const queueStats = await getQueueStats()
  
  // Calculate overall metrics
  const totalImages = progress.reduce((sum, p) => sum + p.totalImages, 0)
  const totalProcessed = progress.reduce((sum, p) => sum + p.processedImages, 0)
  const overallProgress = totalImages > 0 ? Math.round((totalProcessed / totalImages) * 100) : 0
  
  const avgImagesPerMinute = progress.length > 0 
    ? progress.reduce((sum, p) => sum + p.imagesPerMinute, 0) / progress.length 
    : 0

  return {
    folders: progress,
    queueStats,
    overall: {
      totalImages,
      totalProcessed,
      overallProgress,
      avgImagesPerMinute: Math.round(avgImagesPerMinute),
      activeFolders: progress.length,
    }
  }
}

// Folder worker - processes folder analysis jobs
export const folderWorker = new Worker(
  "folders",
  async (job: Job<FolderJobData>) => {
    const startTime = Date.now()
    console.log(`🎯 Folder worker received job: ${job.id} (${job.name})`)
    console.log(`📋 Job data:`, job.data)
    
    const { folderId, googleFolderId } = job.data

    console.log(`🚀 Starting folder processing: ${googleFolderId} at ${new Date().toISOString()}`)

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

      console.log(`📊 Found ${images.length} images to process for folder ${googleFolderId}`)

      // Initialize progress tracking
      folderProgress.set(folderId, {
        startTime,
        totalImages: images.length,
        processedImages: 0,
      })

      // Queue image captioning jobs
      const { queueImageCaptioning } = await import("@/lib/queue")

      for (const image of images) {
        await queueImageCaptioning(image.id, image.fileId, image.etag || "unknown", folderId)
      }

      const queueTime = Date.now() - startTime
      console.log(`✅ Queued ${images.length} image captioning jobs for folder ${googleFolderId}`)
      console.log(`⏱️  Queue time: ${queueTime}ms`)

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
        console.log(`🎉 Folder ${googleFolderId} already completed!`)
      }

      return { success: true, queuedImages: images.length, queueTime }
    } catch (error) {
      console.error(`❌ Folder processing failed for ${googleFolderId}:`, error)

      await prisma.folder.update({
        where: { id: folderId },
        data: { status: "failed" },
      })

      throw error
    }
  },
  {
    connection,
    concurrency: 5, // Keep folder workers low since they handle batches
  },
)

// Image worker - processes individual image captioning jobs
export const imageWorker = new Worker(
  "images", 
  async (job: Job<ImageJobData>) => {
    const startTime = Date.now()
    console.log(`🎯 Image worker received job: ${job.id} (${job.name})`)
    console.log(`📋 Job data:`, job.data)
    
    const { imageId, fileId, etag, folderId } = job.data

    console.log(`🚀 Starting image processing: ${fileId} (etag: ${etag}) at ${new Date().toISOString()}`)

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

      console.log(`📥 Downloading image: ${image.name}`)

      // Rate limiting
      await geminiRateLimiter.waitIfNeeded()

      // Generate caption and tags using Gemini (includes download)
      const captionStart = Date.now()
      const { caption, tags } = await captionImage(fileId, image.mimeType)
      const captionTime = Date.now() - captionStart

      console.log(`✨ Generated caption for ${image.name}: ${caption.substring(0, 100)}...`)
      console.log(`⏱️  Caption generation time: ${captionTime}ms`)

      // Generate embedding for the caption
      const embeddingStart = Date.now()
      const embedding = await generateCaptionEmbedding(caption, tags)
      const embeddingTime = Date.now() - embeddingStart

      console.log(`🧠 Generated embedding for ${image.name}`)
      console.log(`⏱️  Embedding generation time: ${embeddingTime}ms`)

      // Update image with results
      const dbUpdateStart = Date.now()
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "completed",
          caption,
          tags: tags.join(","),
          captionVec: embedding,
        },
      })
      const dbUpdateTime = Date.now() - dbUpdateStart

      // Update folder progress
      await updateFolderProgress(folderId)

      const totalTime = Date.now() - startTime
      console.log(`✅ Completed processing image: ${fileId}`)
      console.log(`📊 Processing breakdown for ${image.name}:`)
      console.log(`   - Caption generation: ${captionTime}ms`)
      console.log(`   - Embedding generation: ${embeddingTime}ms`)
      console.log(`   - Database update: ${dbUpdateTime}ms`)
      console.log(`   - Total processing time: ${totalTime}ms`)

      return { 
        success: true, 
        imageId, 
        fileId, 
        caption: caption.substring(0, 100),
        processingTime: totalTime,
        captionTime,
        embeddingTime,
        dbUpdateTime
      }
    } catch (error) {
      console.error(`❌ Image processing failed for ${fileId}:`, error)

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
    concurrency: 30, // Optimal balance: 30 concurrent * 200 req/min = 6000 req/min (50% of quota)
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

  // Get progress tracking data
  const progress = folderProgress.get(folderId)
  if (progress) {
    const elapsedTime = Date.now() - progress.startTime
    const remainingImages = totalImages - processedImages
    const avgTimePerImage = processedImages > 0 ? elapsedTime / processedImages : 0
    const estimatedTimeRemaining = remainingImages * avgTimePerImage
    const imagesPerMinute = processedImages > 0 ? (processedImages / (elapsedTime / 60000)) : 0

    console.log(`📈 Folder Progress Update:`)
    console.log(`   - Progress: ${processedImages}/${totalImages} images (${Math.round((processedImages/totalImages)*100)}%)`)
    console.log(`   - Status: ${status}`)
    console.log(`   - Elapsed time: ${Math.round(elapsedTime/1000)}s`)
    console.log(`   - Processing speed: ${Math.round(imagesPerMinute)} images/minute`)
    console.log(`   - Average time per image: ${Math.round(avgTimePerImage)}ms`)
    console.log(`   - Estimated time remaining: ${Math.round(estimatedTimeRemaining/1000)}s`)
    
    if (status === "completed") {
      console.log(`🎉 Folder completed! Total time: ${Math.round(elapsedTime/1000)}s`)
      folderProgress.delete(folderId) // Clean up progress tracking
    }
  } else {
    console.log(`Updated folder progress: ${processedImages}/${totalImages} (${status})`)
  }
}

// Worker event handlers
folderWorker.on("completed", (job) => {
  console.log(`✅ Folder job ${job.id} completed`)
})

folderWorker.on("failed", (job, err) => {
  console.error(`❌ Folder job ${job?.id} failed:`, err)
})

folderWorker.on("ready", () => {
  console.log("🚀 Folder worker is ready to process jobs")
})

imageWorker.on("completed", (job) => {
  console.log(`✅ Image job ${job.id} completed`)
})

imageWorker.on("failed", (job, err) => {
  console.error(`❌ Image job ${job?.id} failed:`, err)
})

imageWorker.on("ready", () => {
  console.log("🚀 Image worker is ready to process jobs")
})

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down workers...")
  await Promise.all([folderWorker.close(), imageWorker.close()])
  process.exit(0)
})
