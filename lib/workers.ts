import { Worker, type Job } from "bullmq"
import IORedis from "ioredis"
import { prisma } from "@/lib/prisma"
import { captionImage, generateCaptionEmbedding, geminiRateLimiter } from "@/lib/gemini"
import type { FolderJobData, ImageJobData, ImageBatchJobData } from "@/lib/queue"
import { queueImageBatch } from "@/lib/queue"

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
    
      const { folderId, googleFolderId, accessToken } = job.data

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
          mimeType: true,
          name: true,
        },
      })

      console.log(`📊 Found ${images.length} images to process for folder ${googleFolderId}`)

      // Initialize progress tracking
      folderProgress.set(folderId, {
        startTime,
        totalImages: images.length,
        processedImages: 0,
      })

      // Queue image processing jobs
      // Use batch processing for speed (5 images per batch to mirror Test project)
      const batchSize = 5
      let queuedBatches = 0
      
      for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, i + batchSize)
        const batchData = batch.map(img => ({
          imageId: img.id,
          fileId: img.fileId,
          etag: img.etag || "unknown",
          folderId,
          mimeType: img.mimeType,
          name: img.name
        }))
        
        await queueImageBatch({
          images: batchData,
          folderId,
          accessToken
        })
        queuedBatches++
      }

      const queueTime = Date.now() - startTime
      console.log(`✅ Queued ${queuedBatches} batches (${images.length} images) for folder ${googleFolderId}`)
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

      return { success: true, queuedImages: images.length, queuedBatches, queueTime }
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

// Helper function to process a single image (used inside batch or single job)
async function processImage(image: { imageId: string, fileId: string, etag: string, folderId: string, mimeType?: string, name?: string, accessToken?: string }) {
  const { imageId, fileId, etag, folderId, accessToken } = image
  const startTime = Date.now()
  
  console.log(`🚀 Starting image processing: ${fileId} (etag: ${etag})`)

  try {
    // Update image status to processing (skip if batch, as it adds overhead, but safer for tracking)
    await prisma.image.update({
      where: { id: imageId },
      data: { status: "processing" },
    })

    // Get image details if not provided
    let mimeType = image.mimeType
    let name = image.name
    
    if (!mimeType || !name) {
      const dbImage = await prisma.image.findUnique({
        where: { id: imageId },
        select: { mimeType: true, name: true },
      })
      if (dbImage) {
        mimeType = dbImage.mimeType
        name = dbImage.name
      }
    }

    if (!mimeType || !name) {
      throw new Error("Image not found or details missing")
    }

    // Safety check: Skip unsupported MIME types (shouldn't happen if filtering works, but double-check)
    const supportedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml'
    ]
    
    if (!supportedMimeTypes.includes(mimeType)) {
      console.log(`⚠️  Skipping unsupported MIME type: ${mimeType} for ${name}`)
      await prisma.image.update({
        where: { id: imageId },
        data: { 
          status: "failed",
          error: `Unsupported MIME type: ${mimeType}. Gemini only supports: ${supportedMimeTypes.join(', ')}`
        },
      })
      return { success: false, error: `Unsupported MIME type: ${mimeType}` }
    }

    console.log(`📥 Downloading/Processing image: ${name}`)

    // Rate limiting
    await geminiRateLimiter.waitIfNeeded()

    // Generate extensive caption and tags using full image analysis (or large thumbnail)
    const captioningStart = Date.now()
    const { caption, tags } = await captionImage(fileId, mimeType, accessToken)
    const captioningTime = Date.now() - captioningStart

    console.log(`📝 Generated extensive caption for ${name}`)
    console.log(`🏷️  Generated ${tags.length} tags`)
    console.log(`⏱️  Captioning time: ${captioningTime}ms`)

    // Generate embedding for the caption
    const embeddingStart = Date.now()
    const embedding = await generateCaptionEmbedding(caption, tags)
    const embeddingTime = Date.now() - embeddingStart

    // Update image with results using raw SQL for pgvector
    const dbUpdateStart = Date.now()
    const vectorString = `[${embedding.join(',')}]`
    await prisma.$executeRaw`
      UPDATE images 
      SET 
        status = 'completed',
        caption = ${caption},
        tags = ${tags.join(",")},
        "captionVec" = ${vectorString}::vector,
        "updatedAt" = NOW()
      WHERE id = ${imageId}
    `
    const dbUpdateTime = Date.now() - dbUpdateStart

    // Update folder progress (can be done in batch later, but keeping per image for granular UI updates)
    await updateFolderProgress(folderId)

    const totalTime = Date.now() - startTime
    console.log(`✅ Completed processing image: ${fileId} in ${totalTime}ms`)

    return {
      success: true,
      imageId,
      fileId,
      caption: caption.substring(0, 100),
      processingTime: totalTime,
      captioningTime,
      embeddingTime,
      dbUpdateTime
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ Image processing failed for ${fileId}: ${errorMessage}`)
    
    // Update progress even for failed images so UI doesn't get stuck
    const currentProgress = folderProgress.get(folderId)
    if (currentProgress) {
      currentProgress.processedImages += 1
      folderProgress.set(folderId, currentProgress)
      
      // Check if folder is complete
      if (currentProgress.processedImages >= currentProgress.totalImages) {
        folderProgress.delete(folderId)
        
        // Update folder status in database
        await prisma.folder.update({
          where: { id: folderId },
          data: { 
            status: 'completed',
            processedImages: currentProgress.totalImages
          }
        })
      }
    }

    // Update database to mark image as failed
    await prisma.image.update({
      where: { id: imageId },
      data: { 
        status: 'failed',
        error: errorMessage.substring(0, 500)
      }
    })

    // Return error result instead of throwing - allows batch processing to continue
    return {
      success: false,
      imageId,
      fileId,
      error: errorMessage,
      processingTime: Date.now() - startTime
    }
  }
}

// Image worker - processes both single and batch jobs
export const imageWorker = new Worker(
  "images", 
  async (job: Job) => {
    console.log(`🎯 Image worker received job: ${job.id} (${job.name})`)
    
    if (job.name === 'batch-caption') {
      // Process batch of images
      const { images, folderId, accessToken } = job.data as ImageBatchJobData
      console.log(`📦 Processing batch of ${images.length} images for folder ${folderId}`)
      
      // Process all images in parallel
      // processImage now returns results instead of throwing, so we can use Promise.all
      const results = await Promise.all(images.map(img => processImage({ ...img, accessToken })))
      
      const successCount = results.filter(r => r.success === true).length
      const failCount = results.filter(r => r.success === false).length
      
      console.log(`✅ Batch completed: ${successCount} successful, ${failCount} failed`)
      
      // Log any failures for debugging
      if (failCount > 0) {
        const failures = results.filter(r => r.success === false)
        console.log(`❌ Failed images in batch:`)
        failures.forEach(f => console.log(`   - ${f.fileId}: ${f.error || 'Unknown error'}`))
      }
      
      return { success: true, processed: successCount, failed: failCount }
      
    } else {
      // Process single image (legacy/retry)
      const data = job.data as ImageJobData
      return await processImage({
        imageId: data.imageId,
        fileId: data.fileId,
        etag: data.etag,
        folderId: data.folderId,
        accessToken: data.accessToken
      })
    }
  },
  {
    connection,
    concurrency: 5, // Match batch size for balanced throughput
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
    const processedImages = await prisma.image.count({
      where: { folderId, status: "completed" },
    })
    const imagesPerMinute = processedImages > 0 ? (processedImages / (elapsedTime / 60000)) : 0

    console.log(`📈 Folder Progress Update:`)
    console.log(`   - Progress: ${processedImages}/${totalImages} images (${Math.round((processedImages/totalImages)*100)}%)`)
    console.log(`   - Status: ${status}`)
    console.log(`   - Elapsed time: ${Math.round(elapsedTime/1000)}s`)
    console.log(`   - Processing speed: ${Math.round(imagesPerMinute)} images/minute`)
    
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
