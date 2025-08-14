import { prisma } from "../lib/prisma"
import { folderQueue, imageQueue } from "../lib/queue"

async function safeDelete(folderId?: string) {
  console.log("🗑️ Safe Delete Utility")
  console.log("This will delete data from both database and queue to prevent conflicts")
  
  try {
    if (folderId) {
      // Delete specific folder
      console.log(`\n🔍 Looking for folder: ${folderId}`)
      
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
      // Delete all data
      console.log("\n⚠️ WARNING: This will delete ALL folders and images!")
      console.log("Type 'DELETE ALL' to confirm:")
      
      // For safety, we'll just show what would be deleted
      const folders = await prisma.folder.findMany({
        include: { _count: { select: { images: true } } }
      })
      
      console.log(`\n📊 Current data:`)
      console.log(`   Folders: ${folders.length}`)
      console.log(`   Total Images: ${folders.reduce((sum, f) => sum + f._count.images, 0)}`)
      
      folders.forEach(folder => {
        console.log(`   - ${folder.folderId}: ${folder._count.images} images`)
      })
      
      console.log("\n💡 To delete a specific folder, run:")
      console.log(`   npx tsx scripts/safe-delete.ts <folderId>`)
      console.log("\n💡 To clear all queue data, run:")
      console.log(`   npx tsx scripts/clear-all-queues.ts`)
    }
    
  } catch (error) {
    console.error("❌ Error during safe delete:", error)
  }
  
  process.exit(0)
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