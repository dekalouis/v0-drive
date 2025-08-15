import { folderWorker, imageWorker } from "../lib/workers"
import { enhancedRateLimiter } from "../lib/gemini"

console.log("🚀 Starting optimized BullMQ workers...")
console.log("- Folder worker: processing folders and queuing image jobs (concurrency: 5)")
console.log("- Image worker: processing individual images with AI captioning (concurrency: 8)")
console.log("- Enhanced rate limiter: 15 req/min with burst capability (5 req/sec burst)")
console.log("Press Ctrl+C to stop workers")

// Performance monitoring
let processedJobs = 0
let startTime = Date.now()

// Monitor worker performance
setInterval(() => {
  const uptime = Date.now() - startTime
  const jobsPerMinute = (processedJobs / (uptime / 60000)).toFixed(2)
  
  console.log(`📊 Performance Stats:`)
  console.log(`   - Uptime: ${Math.floor(uptime / 1000)}s`)
  console.log(`   - Total jobs processed: ${processedJobs}`)
  console.log(`   - Jobs per minute: ${jobsPerMinute}`)
  console.log(`   - Workers running: Folder: ${folderWorker.isRunning()}, Image: ${imageWorker.isRunning()}`)
  
  // Log rate limiter stats
  const rateLimitStats = enhancedRateLimiter.getUsageStats()
  console.log(`   - Rate limiter: ${rateLimitStats.totalInWindow}/${rateLimitStats.maxRequests} req/min`)
  console.log(`   - Burst usage: ${rateLimitStats.burstInWindow}/${rateLimitStats.burstSize} req/sec`)
}, 30000) // Log every 30 seconds

// Track completed jobs
folderWorker.on("completed", (job) => {
  processedJobs++
  console.log(`✅ Folder job ${job.id} completed`)
})

imageWorker.on("completed", (job) => {
  processedJobs++
  console.log(`✅ Image job ${job.id} completed`)
})

// Keep the process alive
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...")
  process.exit(0)
})

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...")
  process.exit(0)
})
