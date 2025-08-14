import { folderQueue, imageQueue } from "../lib/queue"

async function clearAllQueues() {
  console.log("🧹 Clearing all queue data...")
  
  try {
    // Clear all job states
    await Promise.all([
      folderQueue.clean(0, 0, "completed"),
      folderQueue.clean(0, 0, "failed"),
      folderQueue.clean(0, 0, "delayed"),
      folderQueue.clean(0, 0, "waiting"),
      folderQueue.clean(0, 0, "active"),
      imageQueue.clean(0, 0, "completed"),
      imageQueue.clean(0, 0, "failed"),
      imageQueue.clean(0, 0, "delayed"),
      imageQueue.clean(0, 0, "waiting"),
      imageQueue.clean(0, 0, "active"),
    ])
    
    console.log("✅ All queue data cleared!")
    
    // Check queue stats
    const [folderStats, imageStats] = await Promise.all([
      folderQueue.getJobCounts(),
      imageQueue.getJobCounts()
    ])
    
    console.log("📊 Queue stats after clearing:")
    console.log("   Folders:", folderStats)
    console.log("   Images:", imageStats)
    
  } catch (error) {
    console.error("❌ Error clearing queues:", error)
  }
  
  process.exit(0)
}

clearAllQueues() 