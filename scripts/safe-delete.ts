import { prisma } from "../lib/prisma"
import { folderQueue, imageQueue } from "../lib/queue"

async function safeDelete(folderId?: string) {
  console.log("🗑️ Safe Delete Utility")
  console.log("This will delete data from both database and queue to prevent conflicts")
  
  try {
    if (folderId && folderId !== "DELETE" && folderId !== "ALL") {
      // Delete specific folder
      console.log(`\n�� Looking for folder: ${folderId}`)
      
      const folder = await prisma.folder.findUnique({
        where: { folderId },
        include: { images: true }
      })
      
      if (!folder) {
        console.log(`❌ Folder not found: ${folderId}`)
        return
      }
      
      console.log(`📁 Found folder: ${folder.id}`)
      console.log(`   Images: ${folder.images.length}`)
      
      // Delete folder and all its images (cascade)
      await prisma.folder.delete({
        where: { id: folder.id }
      })
      
      console.log(`✅ Deleted folder and ${folder.images.length} images`)
      
      // Clear any related queue jobs
      await clearQueueJobs(folderId)
      
    } else {
      // Check if user wants to delete all
      const args = process.argv.slice(2)
      if (args.includes("DELETE") && args.includes("ALL")) {
        console.log("\n⚠️ CONFIRMED: Deleting ALL folders and images!")
        
        // Get count before deletion
        const folders = await prisma.folder.findMany({
          include: { _count: { select: { images: true } } }
        })
        
        const totalImages = folders.reduce((sum, f) => sum + f._count.images, 0)
        
        // Delete all folders (this will cascade delete all images)
        await prisma.folder.deleteMany({})
        
        console.log(`✅ Deleted ${folders.length} folders and ${totalImages} images`)
        
        // Clear all queue data
        await clearAllQueues()
        
      } else {
        // Show current data without deleting
        console.log("\n📊 Current data (no deletion performed):")
        const folders = await prisma.folder.findMany({
          include: { _count: { select: { images: true } } }
        })
        
        console.log(`   Folders: ${folders.length}`)
        console.log(`   Total Images: ${folders.reduce((sum, f) => sum + f._count.images, 0)}`)
        
        folders.forEach(folder => {
          console.log(`   - ${folder.folderId}: ${folder._count.images} images`)
        })
        
        console.log("\n💡 To delete a specific folder, run:")
        console.log(`   npx tsx scripts/safe-delete.ts <folderId>`)
        console.log("\n�� To delete ALL data, run:")
        console.log(`   npx tsx scripts/safe-delete.ts DELETE ALL`)
        console.log("\n�� To clear all queue data, run:")
        console.log(`   npx tsx scripts/clear-all-queues.ts`)
      }
    }
    
  } catch (error) {
    console.error("❌ Error during safe delete:", error)
  }
  
  process.exit(0)
}

async function clearAllQueues() {
  console.log("\n🧹 Clearing all queue data...")
  
  try {
    // First, remove all jobs from both queues
    console.log("   Removing all jobs from queues...")
    
    // Get all jobs from both queues
    const [folderJobs, imageJobs] = await Promise.all([
      folderQueue.getJobs(['completed', 'failed', 'delayed', 'waiting', 'active', 'paused']),
      imageQueue.getJobs(['completed', 'failed', 'delayed', 'waiting', 'active', 'paused'])
    ])
    
    console.log(`   Found ${folderJobs.length} folder jobs and ${imageJobs.length} image jobs`)
    
    // Remove all jobs individually
    const removePromises = [
      ...folderJobs.map(job => job.remove()),
      ...imageJobs.map(job => job.remove())
    ]
    
    await Promise.all(removePromises)
    console.log("   ✅ All jobs removed")
    
    // Now obliterate the queues
    console.log("   Obliterating queues...")
    await Promise.all([
      folderQueue.obliterate(),
      imageQueue.obliterate()
    ])
    
    console.log("✅ All queues cleared successfully")
    
  } catch (error) {
    console.error("❌ Error clearing queues:", error)
    
    // Fallback: try to clear individual queues
    try {
      console.log("🔄 Trying fallback queue clearing...")
      
      // Clear folder queue
      await folderQueue.obliterate({ force: true })
      console.log("✅ Folder queue cleared (force)")
      
      // Clear image queue  
      await imageQueue.obliterate({ force: true })
      console.log("✅ Image queue cleared (force)")
      
    } catch (fallbackError) {
      console.error("💀 Fallback queue clearing also failed:", fallbackError)
    }
  }
}

async function clearQueueJobs(folderId: string) {
  console.log(`\n🧹 Clearing queue jobs for folder: ${folderId}`)
  
  try {
    // Get all jobs and filter by folder ID
    const [folderJobs, imageJobs] = await Promise.all([
      folderQueue.getJobs(['completed', 'failed', 'delayed', 'waiting', 'active']),
      imageQueue.getJobs(['completed', 'failed', 'delayed', 'waiting', 'active'])
    ])
    
    let deletedJobs = 0
    
    // Delete folder jobs
    for (const job of folderJobs) {
      if (job.data.googleFolderId === folderId) {
        await job.remove()
        deletedJobs++
      }
    }
    
    // Delete image jobs (they contain folderId in data)
    for (const job of imageJobs) {
      if (job.data.folderId && job.data.folderId.includes(folderId)) {
        await job.remove()
        deletedJobs++
      }
    }
    
    console.log(`✅ Cleared ${deletedJobs} queue jobs`)
    
  } catch (error) {
    console.error("❌ Error clearing queue jobs:", error)
  }
}

// Get folder ID from command line argument
const folderId = process.argv[2]

safeDelete(folderId)