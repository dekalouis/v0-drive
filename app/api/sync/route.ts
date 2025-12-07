import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { listImagesRecursively, type DriveFile } from "@/lib/drive"
import { queueFolderProcessing } from "@/lib/queue"

// Get the maximum images limit from environment variable
const getMaxImagesLimit = (): number | null => {
  const limit = process.env.MAX_IMAGES_PER_FOLDER
  if (!limit) return null
  
  const parsed = parseInt(limit, 10)
  return isNaN(parsed) || parsed <= 0 ? null : parsed
}

export async function POST(request: NextRequest) {
  try {
    const { folderId } = await request.json()

    if (!folderId) {
      return NextResponse.json({ error: "folderId is required" }, { status: 400 })
    }

    // Get folder from database
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    })

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    console.log(`🔄 Syncing folder: ${folder.name || folder.folderId}`)

    // Fetch current state from Google Drive (recursively including subfolders)
    const driveResult = await listImagesRecursively(folder.folderId)

    if (!driveResult.success) {
      console.log(`❌ Failed to sync folder: ${driveResult.error}`)
      return NextResponse.json({ error: driveResult.error }, { status: 403 })
    }

    // Get existing image fileIds from database
    const existingImages = await prisma.image.findMany({
      where: { folderId },
      select: { fileId: true },
    })
    const existingFileIds = new Set(existingImages.map(img => img.fileId))

    // Find new images (in Drive but not in DB)
    const driveFileIds = new Set(driveResult.images.map(img => img.id).filter(Boolean))
    const newImages = driveResult.images.filter(img => img.id && !existingFileIds.has(img.id))

    // Find deleted images (in DB but not in Drive)
    const deletedFileIds = [...existingFileIds].filter(fileId => !driveFileIds.has(fileId))

    console.log(`📊 Sync results:`)
    console.log(`   - Images in Drive: ${driveResult.count}`)
    console.log(`   - Images in DB: ${existingImages.length}`)
    console.log(`   - New images to add: ${newImages.length}`)
    console.log(`   - Deleted images to remove: ${deletedFileIds.length}`)

    let newImagesAdded = 0
    let deletedImagesRemoved = 0

    // Add new images to database
    if (newImages.length > 0) {
      // Check against maximum images limit
      const maxImagesLimit = getMaxImagesLimit()
      const totalAfterSync = existingImages.length - deletedFileIds.length + newImages.length
      if (maxImagesLimit && totalAfterSync > maxImagesLimit) {
        console.log(`❌ Folder would exceed maximum image limit after sync: ${totalAfterSync} > ${maxImagesLimit}`)
        return NextResponse.json({ 
          error: `Adding these images would exceed the limit of ${maxImagesLimit} images per folder!` 
        }, { status: 400 })
      }

      const imageData = newImages
        .filter((file): file is DriveFile & { id: string; name: string; mimeType: string } => 
          Boolean(file.id && file.name && file.mimeType))
        .map((file) => ({
          folderId,
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          thumbnailLink: file.thumbnailLink || "",
          webViewLink: file.webViewLink || "",
          size: file.size ? Number.parseInt(file.size) : null,
          md5Checksum: file.md5Checksum || null,
          modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
          etag: file.version || null,
          status: "pending",
        }))

      if (imageData.length > 0) {
        await prisma.image.createMany({ data: imageData })
        newImagesAdded = imageData.length
        console.log(`✅ Added ${newImagesAdded} new image records`)
      }
    }

    // Remove deleted images from database
    if (deletedFileIds.length > 0) {
      await prisma.image.deleteMany({
        where: {
          folderId,
          fileId: { in: deletedFileIds },
        },
      })
      deletedImagesRemoved = deletedFileIds.length
      console.log(`🗑️ Removed ${deletedImagesRemoved} deleted image records`)
    }

    // Update folder totals
    const updatedTotalImages = existingImages.length - deletedImagesRemoved + newImagesAdded
    const updatedProcessedImages = await prisma.image.count({
      where: { folderId, status: "completed" },
    })

    // Determine new status
    let newStatus = folder.status
    if (newImagesAdded > 0) {
      newStatus = "processing" // Need to process new images
    } else if (updatedProcessedImages === updatedTotalImages && updatedTotalImages > 0) {
      newStatus = "completed"
    }

    // Update folder record
    await prisma.folder.update({
      where: { id: folderId },
      data: {
        name: driveResult.folderName,
        totalImages: updatedTotalImages,
        processedImages: updatedProcessedImages,
        status: newStatus,
      },
    })

    // Queue processing if there are new images
    if (newImagesAdded > 0) {
      console.log("🚀 Queueing folder processing for new images...")
      await queueFolderProcessing(folderId, folder.folderId)
    }

    return NextResponse.json({
      success: true,
      folderId,
      status: newStatus,
      totalImages: updatedTotalImages,
      processedImages: updatedProcessedImages,
      newImagesAdded,
      deletedImagesRemoved,
      message: newImagesAdded > 0 || deletedImagesRemoved > 0 
        ? `Synced: +${newImagesAdded} new, -${deletedImagesRemoved} removed`
        : "Folder is already up to date",
    })
  } catch (error) {
    console.error("❌ Sync API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
