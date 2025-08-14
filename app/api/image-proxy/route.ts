import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get("url")
    const fileId = searchParams.get("fileId")

    if (!imageUrl && !fileId) {
      return NextResponse.json({ error: "URL or fileId parameter is required" }, { status: 400 })
    }

    let finalUrl = imageUrl

    // If we have a fileId, construct the Google Drive URL
    if (fileId && !imageUrl) {
      finalUrl = `https://drive.google.com/uc?export=view&id=${fileId}`
    }

    if (!finalUrl) {
      return NextResponse.json({ error: "No valid image URL" }, { status: 400 })
    }

    console.log(`🖼️ Proxying image: ${finalUrl}`)

    // Fetch the image
    const response = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    })

    if (!response.ok) {
      console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`)
      return NextResponse.json({ error: "Failed to fetch image" }, { status: response.status })
    }

    // Get the image data
    const imageBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    console.log(`✅ Successfully proxied image: ${contentType} (${imageBuffer.byteLength} bytes)`)

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error("❌ Image proxy error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 