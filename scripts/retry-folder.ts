import { prisma } from "../lib/prisma"
import { queueFolderProcessing } from "../lib/queue"

async function retryFolder(folderId: string) {
  console.log(`🔄 Retrying folder processing for: ${folderId}`)
  
  try {
    // Find the folder
    const folder = await prisma.folder.findUnique({
      where: { folderId },
      include: { images: true }
    })
    
    if (!folder) {
      console.log(`❌ Folder not found: ${folderId}`)
      return
    }
    
    console.log(`📁 Found folder: ${folder.id}`)
    console.log(`   Status: ${folder.status}`)
    console.log(`   Total Images: ${folder.totalImages}`)
    console.log(`   Processed Images: ${folder.processedImages}`)
    
    // Reset folder status
    await prisma.folder.update({
      where: { id: folder.id },
      data: { 
        status: "pending",
        processedImages: 0
      }
    })
    
    // Reset all images to pending
    await prisma.image.updateMany({
      where: { folderId: folder.id },
      data: { 
        status: "pending",
        caption: null,
        tags: null,
        captionVec: { set: null },
        error: null
      }
    })
    
    console.log(`✅ Reset folder and ${folder.images.length} images to pending`)
    
    // Queue folder processing
    await queueFolderProcessing(folder.id, folderId)
    
    console.log(`🚀 Folder processing queued successfully`)
    
  } catch (error) {
    console.error("❌ Error retrying folder:", error)
  }
  
  process.exit(0)
}

// Get folder ID from command line argument
const folderId = process.argv[2]
if (!folderId) {
  console.log("❌ Please provide a folder ID as argument")
  console.log("Usage: npx tsx scripts/retry-folder.ts <folderId>")
  process.exit(1)
}

retryFolder(folderId) 