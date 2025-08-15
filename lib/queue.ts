import { Queue } from "bullmq"
import IORedis from "ioredis"

// Redis connection
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

// Add connection event logging
connection.on("connect", () => {
  console.log("🔗 Redis connected successfully")
})

connection.on("error", (error) => {
  console.error("❌ Redis connection error:", error)
})

connection.on("ready", () => {
  console.log("✅ Redis ready for operations")
})

// Queue configurations
export const folderQueue = new Queue("folders", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
})

export const imageQueue = new Queue("images", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
})

// Queue event logging will be handled in the workers

// Job data interfaces
export interface FolderJobData {
  folderId: string
  googleFolderId: string
}

export interface ImageJobData {
  imageId: string
  fileId: string
  etag: string
  folderId: string
}

// Queue folder processing job
export async function queueFolderProcessing(folderId: string, googleFolderId: string) {
  const jobId = `folder:${googleFolderId}`

  console.log(`🚀 Queueing folder processing job: ${jobId}`)
  console.log(`   - Database ID: ${folderId}`)
  console.log(`   - Google Folder ID: ${googleFolderId}`)
  console.log(`   - Timestamp: ${new Date().toISOString()}`)

  try {
    await folderQueue.add("process", { folderId, googleFolderId } as FolderJobData, {
      jobId, // Use folder ID for deduplication
      // delay: 1000, // Small delay to ensure DB consistency - REMOVED FOR TESTING
    })

    console.log(`✅ Successfully queued folder processing job: ${jobId}`)
    
    // Log queue stats
    const stats = await folderQueue.getJobCounts()
    console.log(`📊 Folder queue stats:`, stats)
  } catch (error) {
    console.error(`❌ Failed to queue folder processing job: ${jobId}`, error)
    throw error
  }
}

// Queue image captioning job
export async function queueImageCaptioning(imageId: string, fileId: string, etag: string, folderId: string) {
  const jobId = `image:${fileId}:${etag}`

  console.log(`🚀 Queueing image captioning job: ${jobId}`)
  console.log(`   - Image ID: ${imageId}`)
  console.log(`   - File ID: ${fileId}`)
  console.log(`   - ETag: ${etag}`)
  console.log(`   - Folder ID: ${folderId}`)
  console.log(`   - Timestamp: ${new Date().toISOString()}`)

  try {
    await imageQueue.add("caption", { imageId, fileId, etag, folderId } as ImageJobData, {
      jobId, // Use fileId:etag for idempotency
    })

    console.log(`✅ Successfully queued image captioning job: ${jobId}`)
    
    // Log queue stats
    const stats = await imageQueue.getJobCounts()
    console.log(`📊 Image queue stats:`, stats)
  } catch (error) {
    console.error(`❌ Failed to queue image captioning job: ${jobId}`, error)
    throw error
  }
}

// Get queue stats with enhanced logging
export async function getQueueStats() {
  console.log("📊 Getting queue statistics...")
  
  try {
    const [folderStats, imageStats] = await Promise.all([folderQueue.getJobCounts(), imageQueue.getJobCounts()])

    console.log("📊 Queue Statistics:")
    console.log(`   Folders:`, folderStats)
    console.log(`   Images:`, imageStats)
    
    // Calculate processing rate if we have active jobs
    if (imageStats.active && imageStats.active > 0) {
      console.log(`⚡ Active image processing: ${imageStats.active} jobs`)
    }
    
    if (imageStats.waiting && imageStats.waiting > 0) {
      console.log(`⏳ Waiting images: ${imageStats.waiting} jobs`)
    }

    return {
      folders: folderStats,
      images: imageStats,
    }
  } catch (error) {
    console.error("❌ Failed to get queue stats:", error)
    throw error
  }
}

// Clean up completed jobs
export async function cleanupJobs() {
  console.log("🧹 Cleaning up completed jobs...")
  
  try {
    await Promise.all([
      folderQueue.clean(24 * 60 * 60 * 1000, 10, "completed"), // Keep completed jobs for 24h
      folderQueue.clean(7 * 24 * 60 * 60 * 1000, 50, "failed"), // Keep failed jobs for 7 days
      imageQueue.clean(24 * 60 * 60 * 1000, 100, "completed"),
      imageQueue.clean(7 * 24 * 60 * 60 * 1000, 100, "failed"),
    ])
    
    console.log("✅ Job cleanup completed")
  } catch (error) {
    console.error("❌ Job cleanup failed:", error)
    throw error
  }
}
