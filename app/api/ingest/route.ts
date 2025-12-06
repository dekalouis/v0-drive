import { type NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { validateAndListImages } from "@/lib/drive"
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
    const { userId: clerkUserId } = await auth()
    const { folderUrl } = await request.json()

    if (!folderUrl) {
      return NextResponse.json({ error: "folderUrl is required" }, { status: 400 })
    }

    // Find or create user if authenticated
    let dbUserId: string | null = null
    if (clerkUserId) {
      console.log(`👤 Authenticated user: ${clerkUserId}`)
      
      // Get full user data from Clerk including email
      const clerkUser = await currentUser()
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress || null
      
      const user = await prisma.user.upsert({
        where: { clerkId: clerkUserId },
        update: { email }, // Update email in case it changed
        create: { clerkId: clerkUserId, email },
      })
      dbUserId = user.id
    }

    // Extract folder ID from URL
    console.log("🔍 Extracting folder ID from URL...")
    const folderIdMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9-_]+)/)
    if (!folderIdMatch) {
      return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 })
    }

    const folderId = folderIdMatch[1]
    console.log(`📁 Extracted folder ID: ${folderId}`)

    // Check if folder already exists
    console.log("🔍 Checking if folder already exists in database...")
    const existingFolder = await prisma.folder.findUnique({
      where: { folderId },
    })

    if (existingFolder) {
      console.log(`📁 Folder already exists with status: ${existingFolder.status}`)
      console.log(`   - Database ID: ${existingFolder.id}`)
      console.log(`   - Total Images: ${existingFolder.totalImages}`)
      console.log(`   - Processed Images: ${existingFolder.processedImages}`)
      
      // Link folder to user if not already linked
      if (dbUserId && !existingFolder.userId) {
        await prisma.folder.update({
          where: { id: existingFolder.id },
          data: { userId: dbUserId },
        })
        console.log(`🔗 Linked existing folder to user`)
      }
      
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

    console.log(`✅ Found ${result.count} images in folder "${result.folderName}"`)
    
    // Check against maximum images limit
    const maxImagesLimit = getMaxImagesLimit()
    if (maxImagesLimit && result.count > maxImagesLimit) {
      console.log(`❌ Folder exceeds maximum image limit: ${result.count} > ${maxImagesLimit}`)
      return NextResponse.json({ 
        error: `Your folder has too many images! Make sure that the folder does not contain more than ${maxImagesLimit} images!` 
      }, { status: 400 })
    }
    
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
        name: result.folderName,
        folderUrl,
        status: "pending",
        totalImages: result.count,
        userId: dbUserId,
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
