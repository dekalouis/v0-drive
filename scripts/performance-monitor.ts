#!/usr/bin/env tsx

import { getQueueStats } from "../lib/queue"
import { enhancedRateLimiter } from "../lib/gemini"
import { prisma } from "../lib/prisma"

async function monitorPerformance() {
  console.log("🚀 Performance Monitor Starting...")
  console.log("=" * 50)

  try {
    // Get queue statistics
    const queueStats = await getQueueStats()
    console.log("📊 Queue Statistics:")
    console.log(`   Folders: ${JSON.stringify(queueStats.folders, null, 2)}`)
    console.log(`   Images: ${JSON.stringify(queueStats.images, null, 2)}`)

    // Get rate limiter statistics
    const rateLimitStats = enhancedRateLimiter.getUsageStats()
    console.log("\n⚡ Rate Limiter Statistics:")
    console.log(`   Total requests in window: ${rateLimitStats.totalInWindow}/${rateLimitStats.maxRequests}`)
    console.log(`   Burst requests in window: ${rateLimitStats.burstInWindow}/${rateLimitStats.burstSize}`)
    console.log(`   Window size: ${rateLimitStats.windowMs}ms`)
    console.log(`   Burst window: ${rateLimitStats.burstWindowMs}ms`)

    // Get database statistics
    const [totalFolders, totalImages, completedImages, failedImages, pendingImages] = await Promise.all([
      prisma.folder.count(),
      prisma.image.count(),
      prisma.image.count({ where: { status: "completed" } }),
      prisma.image.count({ where: { status: "failed" } }),
      prisma.image.count({ where: { status: "pending" } }),
    ])

    console.log("\n🗄️ Database Statistics:")
    console.log(`   Total folders: ${totalFolders}`)
    console.log(`   Total images: ${totalImages}`)
    console.log(`   Completed images: ${completedImages}`)
    console.log(`   Failed images: ${failedImages}`)
    console.log(`   Pending images: ${pendingImages}`)
    console.log(`   Success rate: ${totalImages > 0 ? ((completedImages / totalImages) * 100).toFixed(2) : 0}%`)

    // Performance recommendations
    console.log("\n💡 Performance Recommendations:")
    
    if (pendingImages > 0) {
      const estimatedTime = Math.ceil(pendingImages / 15) // 15 req/min
      console.log(`   ⏱️  Estimated time to complete pending images: ~${estimatedTime} minutes`)
    }

    if (failedImages > 0) {
      console.log(`   🔄 Consider retrying failed images: npm run folder:retry <folderId>`)
    }

    if (rateLimitStats.totalInWindow > rateLimitStats.maxRequests * 0.8) {
      console.log(`   ⚠️  Rate limit approaching: ${rateLimitStats.totalInWindow}/${rateLimitStats.maxRequests}`)
    }

    if (queueStats.images.waiting > 50) {
      console.log(`   📈 High queue backlog: ${queueStats.images.waiting} images waiting`)
      console.log(`   💡 Consider increasing worker concurrency or adding more workers`)
    }

    console.log("\n" + "=" * 50)
    console.log("✅ Performance monitoring completed")

  } catch (error) {
    console.error("❌ Performance monitoring failed:", error)
  } finally {
    await prisma.$disconnect()
    process.exit(0)
  }
}

// Run if called directly
if (require.main === module) {
  monitorPerformance()
}

export { monitorPerformance }