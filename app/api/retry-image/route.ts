import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { imageQueue } from "@/lib/queue"

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
      // Retry all failed images in folder
      console.log(`🔄 Retrying all failed images in folder: ${folderId}`)
      
      const failedImages = await prisma.image.findMany({
        where: { 
          folderId,
          status: "failed"
        },
        select: {
          id: true,
          fileId: true,
          name: true,
          mimeType: true,
          folderId: true,
        }
      })

      if (failedImages.length === 0) {
        return NextResponse.json(
          { error: "No failed images found in this folder" },
          { status: 404 }
        )
      }

      // Reset all failed images to pending using raw SQL (captionVec is an Unsupported type)
      await prisma.$executeRaw`
        UPDATE images 
        SET status = 'pending', caption = NULL, tags = NULL, "captionVec" = NULL, error = NULL
        WHERE "folderId" = ${folderId} AND status = 'failed'
      `

      // Add all failed images to queue
      const jobs = failedImages.map(image => ({
        name: "image",
        data: {
          fileId: image.fileId,
          name: image.name,
          mimeType: image.mimeType,
          folderId: image.folderId,
          imageId: image.id
        }
      }))

      await imageQueue.addBulk(jobs)

      console.log(`✅ Queued ${failedImages.length} failed images for retry`)
      
      return NextResponse.json({ 
        success: true, 
        message: `${failedImages.length} images queued for retry` 
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
