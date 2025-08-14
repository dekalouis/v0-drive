import { prisma } from "../lib/prisma"

async function checkFolderStatus(folderId: string) {
  console.log(`🔍 Checking folder status for: ${folderId}`)
  
  try {
    // Find the folder
    const folder = await prisma.folder.findUnique({
      where: { folderId },
      include: { 
        images: {
          select: {
            id: true,
            name: true,
            status: true,
            caption: true,
            tags: true,
            error: true
          }
        }
      }
    })
    
    if (!folder) {
      console.log(`❌ Folder not found: ${folderId}`)
      return
    }
    
    console.log(`📁 Folder: ${folder.id}`)
    console.log(`   Status: ${folder.status}`)
    console.log(`   Total Images: ${folder.totalImages}`)
    console.log(`   Processed Images: ${folder.processedImages}`)
    
    console.log(`\n📋 Image Status:`)
    const statusCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    }
    
    folder.images.forEach(image => {
      statusCounts[image.status as keyof typeof statusCounts]++
      const errorInfo = image.error ? ` (${image.error})` : ''
      const captionPreview = image.caption ? ` - "${image.caption.substring(0, 50)}..."` : ''
      console.log(`   ${image.name}: ${image.status}${errorInfo}${captionPreview}`)
    })
    
    console.log(`\n📊 Summary:`)
    console.log(`   Pending: ${statusCounts.pending}`)
    console.log(`   Processing: ${statusCounts.processing}`)
    console.log(`   Completed: ${statusCounts.completed}`)
    console.log(`   Failed: ${statusCounts.failed}`)
    
  } catch (error) {
    console.error("❌ Error checking folder status:", error)
  }
  
  process.exit(0)
}

// Get folder ID from command line argument
const folderId = process.argv[2]
if (!folderId) {
  console.log("❌ Please provide a folder ID as argument")
  console.log("Usage: npx tsx scripts/check-folder-status.ts <folderId>")
  process.exit(1)
}

checkFolderStatus(folderId) 