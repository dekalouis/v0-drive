import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { extractFolderId, validateAndListImages, isValidDriveUrl } from "@/lib/drive"
import { queueFolderProcessing } from "@/lib/queue"

export async function POST(request: NextRequest) {
  console.log("🚀 Ingest API called")
  
  try {
    const { folderUrl } = await request.json()
    console.log(`📁 Processing folder URL: ${folderUrl}`)

    if (!folderUrl || typeof folderUrl !== "string") {
      console.log("❌ Invalid folder URL provided")
      return NextResponse.json({ error: "Folder URL is required" }, { status: 400 })
    }

    // Validate URL format
    if (!isValidDriveUrl(folderUrl)) {
      console.log("❌ Invalid Google Drive URL format")
      return NextResponse.json({ error: "Invalid Google Drive folder URL format" }, { status: 400 })
    }

    // Extract folder ID
    const folderId = extractFolderId(folderUrl)
    if (!folderId) {
      console.log("❌ Could not extract folder ID from URL")
      return NextResponse.json({ error: "Could not extract folder ID from URL" }, { status: 400 })
    }
    
    console.log(`🔍 Extracted folder ID: ${folderId}`)

    // Check if folder already exists
    console.log("🔍 Checking if folder already exists in database...")
    const existingFolder = await prisma.folder.findUnique({
      where: { folderId },
      include: { images: true },
    })

    if (existingFolder) {
      console.log(`📁 Folder already exists with status: ${existingFolder.status}`)
      console.log(`   - Database ID: ${existingFolder.id}`)
      console.log(`   - Total Images: ${existingFolder.totalImages}`)
      console.log(`   - Processed Images: ${existingFolder.processedImages}`)
      
      if (existingFolder.status === "failed" || existingFolder.status === "pending") {
        console.log("🔄 Re-queueing folder processing...")
        await queueFolderProcessing(existingFolder.id, folderId)
      }

      return NextResponse.json({
        folderId: existingFolder.id,
        status: existingFolder.status,
        totalImages: existingFolder.totalImages,
        processedImages: existingFolder.processedImages,
        message: "Folder already exists",
      })
    }

    // Validate folder access and get images
    console.log("🔍 Validating folder access and listing images...")
    const result = await validateAndListImages(folderId)

    if (!result.success) {
      console.log(`❌ Folder validation failed: ${result.error}`)
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    console.log(`✅ Found ${result.count} images in folder`)
    console.log("📋 Image details:")
    result.images.forEach((img, index: number) => {
      console.log(`   ${index + 1}. ${img.name || 'Unknown'} (${img.mimeType || 'Unknown'}) - ${img.id || 'Unknown'}`)
    })

    if (result.count === 0) {
      console.log("❌ No images found in the folder")
      return NextResponse.json({ error: "No images found in the folder" }, { status: 400 })
    }

    // Create folder record
    console.log("💾 Creating folder record in database...")
    const folder = await prisma.folder.create({
      data: {
        folderId,
        folderUrl,
        status: "pending",
        totalImages: result.count,
      },
    })
    
    console.log(`✅ Created folder record with ID: ${folder.id}`)

    // Create image records
    console.log("💾 Creating image records in database...")
    const imageData = result.images
      .filter((file) => file.id && file.name && file.mimeType) // Filter out files without required fields
      .map((file) => ({
        folderId: folder.id,
        fileId: file.id!, // Non-null assertion since we filtered
        name: file.name!,
        mimeType: file.mimeType!,
        thumbnailLink: file.thumbnailLink || "",
        webViewLink: file.webViewLink || "",
        size: file.size ? Number.parseInt(file.size) : null,
        md5Checksum: file.md5Checksum,
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
        etag: file.version,
        status: "pending",
      }))

    if (imageData.length === 0) {
      console.log("❌ No valid images found after filtering")
      return NextResponse.json({ error: "No valid images found in the folder" }, { status: 400 })
    }

    await prisma.image.createMany({
      data: imageData,
    })
    
    console.log(`✅ Created ${imageData.length} image records`)

    // Queue folder processing
    console.log("🚀 Queueing folder processing job...")
    await queueFolderProcessing(folder.id, folderId)
    console.log("✅ Folder processing job queued successfully")

    return NextResponse.json({
      folderId: folder.id,
      status: folder.status,
      totalImages: folder.totalImages,
      processedImages: folder.processedImages,
    })
  } catch (error) {
    console.error("❌ Ingest API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
