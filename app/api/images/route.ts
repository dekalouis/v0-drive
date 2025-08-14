import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Helper function to clean captions
function cleanCaption(caption?: string): string | undefined {
  if (!caption) return undefined
  
  // Handle HTML-encoded JSON strings
  let cleanedCaption = caption
  
  // Decode HTML entities first
  if (caption.includes('&quot;')) {
    cleanedCaption = caption.replace(/&quot;/g, '"')
  }
  
  // Remove markdown code blocks if present
  if (cleanedCaption.startsWith('```json') && cleanedCaption.endsWith('```')) {
    cleanedCaption = cleanedCaption.replace(/^```json\n/, '').replace(/\n```$/, '')
  }
  
  // If caption contains JSON structure, extract just the caption text
  if (cleanedCaption.includes('"caption"')) {
    try {
      const parsed = JSON.parse(cleanedCaption)
      return parsed.caption || caption
    } catch {
      // If parsing fails, return as is
      return caption
    }
  }
  
  return caption
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get("folderId")

    if (!folderId) {
      return NextResponse.json({ error: "folderId parameter is required" }, { status: 400 })
    }

    // Get folder data
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: {
        id: true,
        folderId: true,
        status: true,
        totalImages: true,
        processedImages: true,
      },
    })

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    // Get images for this folder
    const images = await prisma.image.findMany({
      where: { folderId },
      select: {
        id: true,
        fileId: true,
        name: true,
        thumbnailLink: true,
        webViewLink: true,
        status: true,
        caption: true,
        tags: true,
        error: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    })

    // Clean captions for all images
    const cleanedImages = images.map(image => ({
      ...image,
      caption: image.caption ? cleanCaption(image.caption) : undefined
    }))

    return NextResponse.json({
      ...folder,
      images: cleanedImages,
    })
  } catch (error) {
    console.error("Images API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
