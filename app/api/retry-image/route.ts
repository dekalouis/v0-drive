import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { imageQueue, queueImageBatch } from "@/lib/queue"

export async function POST(request: NextRequest) {
  try {
    const { imageId, folderId } = await request.json()

    if (!imageId && !folderId) {
      return NextResponse.json(
        { error: "Either imageId or folderId is required" },
        { status: 400 }
      )
    }

    if (imageId) {
      // Retry single image
      console.log(`🔄 Retrying single image: ${imageId}`)
      
      const image = await prisma.image.findUnique({
        where: { id: imageId },
        select: {
          id: true,
          fileId: true,
          name: true,
          mimeType: true,
          folderId: true,
        }
      })

      if (!image) {
        return NextResponse.json(
          { error: "Image not found" },
          { status: 404 }
        )
      }

      // Reset image status to pending using raw SQL (captionVec is an Unsupported type)
      await prisma.$executeRaw`
        UPDATE images 
        SET status = 'pending', caption = NULL, tags = NULL, "captionVec" = NULL, error = NULL
        WHERE id = ${imageId}
      `

      // Add to image processing queue
      await imageQueue.add("image", {
        fileId: image.fileId,
        name: image.name,
        mimeType: image.mimeType,
        folderId: image.folderId,
        imageId: image.id
      })

      console.log(`✅ Queued image for retry: ${image.name}`)
      
      return NextResponse.json({ 
        success: true, 
        message: "Image queued for retry" 
      })

    } else if (folderId) {
      // Retry all failed AND pending images in folder
      console.log(`🔄 Retrying all failed and pending images in folder: ${folderId}`)
      
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { id: true, status: true }
      })

      if (!folder) {
        return NextResponse.json(
          { error: "Folder not found" },
          { status: 404 }
        )
      }

      // Get failed images
      const failedImages = await prisma.image.findMany({
        where: { 
          folderId,
          status: "failed"
        },
        select: {
          id: true,
          fileId: true,
          etag: true,
          name: true,
          mimeType: true,
          folderId: true,
        }
      })

      // Get pending images
      const pendingImages = await prisma.image.findMany({
        where: { 
          folderId,
          status: "pending"
        },
        select: {
          id: true,
          fileId: true,
          etag: true,
          name: true,
          mimeType: true,
          folderId: true,
        }
      })

      const allImages = [...failedImages, ...pendingImages]

      if (allImages.length === 0) {
        return NextResponse.json(
          { error: "No failed or pending images found in this folder" },
          { status: 404 }
        )
      }

      // Reset all failed images to pending using raw SQL (captionVec is an Unsupported type)
      if (failedImages.length > 0) {
      await prisma.$executeRaw`
        UPDATE images 
        SET status = 'pending', caption = NULL, tags = NULL, "captionVec" = NULL, error = NULL
        WHERE "folderId" = ${folderId} AND status = 'failed'
      `
      }

      // Update folder status to processing
      if (folder.status !== "processing") {
        await prisma.folder.update({
          where: { id: folderId },
          data: { status: "processing" },
        })
      }

      // Queue images in batches of 5 (same as folder worker)
      const batchSize = 5
      let queuedBatches = 0
      
      for (let i = 0; i < allImages.length; i += batchSize) {
        const batch = allImages.slice(i, i + batchSize)
        const batchData = batch.map(img => ({
          imageId: img.id,
          fileId: img.fileId,
          etag: img.etag || "unknown",
          folderId: img.folderId,
          mimeType: img.mimeType,
          name: img.name
        }))
        
        await queueImageBatch({
          images: batchData,
          folderId: folder.id,
          accessToken: undefined
        })
        queuedBatches++
      }

      console.log(`✅ Queued ${queuedBatches} batches (${allImages.length} images) for retry`)
      
      return NextResponse.json({ 
        success: true, 
        message: `${allImages.length} images queued for processing (${failedImages.length} failed, ${pendingImages.length} pending)` 
      })
    }

  } catch (error) {
    console.error("❌ Retry error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 
