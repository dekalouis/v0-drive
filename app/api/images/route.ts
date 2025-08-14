import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

    return NextResponse.json({
      ...folder,
      images,
    })
  } catch (error) {
    console.error("Images API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
