import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getFreshThumbnailUrl } from "@/lib/drive"

// In-memory cache for thumbnail URLs (simple TTL cache)
const thumbnailCache = new Map<string, { url: string; expiresAt: number }>()
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

function getCachedThumbnailUrl(fileId: string, size: number): string | null {
  const cacheKey = `${fileId}-${size}`
  const cached = thumbnailCache.get(cacheKey)
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url
  }
  
  // Clean up expired entry
  if (cached) {
    thumbnailCache.delete(cacheKey)
  }
  
  return null
}

function setCachedThumbnailUrl(fileId: string, size: number, url: string): void {
  const cacheKey = `${fileId}-${size}`
  thumbnailCache.set(cacheKey, {
    url,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  
  // Clean up old entries if cache gets too large (> 10000 entries)
  if (thumbnailCache.size > 10000) {
    const now = Date.now()
    for (const [key, value] of thumbnailCache.entries()) {
      if (value.expiresAt < now) {
        thumbnailCache.delete(key)
      }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId, getToken } = await auth()
    
    // Try to get Google OAuth token (optional)
    let accessToken: string | null = null
    try {
      accessToken = await getToken({ template: "oauth_google" })
    } catch (error) {
      // Token not available - will use API key for public folders
    }

    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get("fileId")
    const sizeParam = searchParams.get("size")
    const size = sizeParam ? parseInt(sizeParam, 10) : 220

    if (!fileId) {
      return NextResponse.json({ error: "fileId parameter is required" }, { status: 400 })
    }

    if (isNaN(size) || size < 32 || size > 1600) {
      return NextResponse.json({ error: "Invalid size parameter (32-1600)" }, { status: 400 })
    }

    // Check cache first
    let thumbnailUrl = getCachedThumbnailUrl(fileId, size)
    
    if (!thumbnailUrl) {
      // Fetch fresh thumbnail URL from Google Drive API
      thumbnailUrl = await getFreshThumbnailUrl(fileId, size)
      
      if (!thumbnailUrl) {
        console.error(`❌ No thumbnail available for file ${fileId}`)
        return NextResponse.json({ error: "Thumbnail not available" }, { status: 404 })
      }
      
      // Cache the URL
      setCachedThumbnailUrl(fileId, size, thumbnailUrl)
    }

    // Fetch the actual thumbnail image
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      const response = await fetch(thumbnailUrl, {
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        // If the cached URL failed, try fetching a fresh one
        if (getCachedThumbnailUrl(fileId, size)) {
          thumbnailCache.delete(`${fileId}-${size}`)
          const freshUrl = await getFreshThumbnailUrl(fileId, size)
          
          if (freshUrl) {
            setCachedThumbnailUrl(fileId, size, freshUrl)
            const retryResponse = await fetch(freshUrl, {
              headers,
            })
            
            if (retryResponse.ok) {
              const imageBuffer = await retryResponse.arrayBuffer()
              const contentType = retryResponse.headers.get('content-type') || 'image/jpeg'
              
              return new NextResponse(imageBuffer, {
                status: 200,
                headers: {
                  'Content-Type': contentType,
                  'Cache-Control': 'public, max-age=7200', // 2 hours
                  'Access-Control-Allow-Origin': '*',
                },
              })
            }
          }
        }
        
        console.error(`❌ Failed to fetch thumbnail for ${fileId}: ${response.status}`)
        return NextResponse.json({ 
          error: `Failed to fetch thumbnail: ${response.status}` 
        }, { status: response.status })
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const imageBuffer = await response.arrayBuffer()

      if (imageBuffer.byteLength === 0) {
        console.error(`❌ Empty thumbnail data for ${fileId}`)
        return NextResponse.json({ error: "Empty thumbnail data" }, { status: 400 })
      }

      return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=7200', // 2 hours
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error(`❌ Thumbnail fetch timeout for ${fileId}`)
        return NextResponse.json({ error: "Thumbnail fetch timeout" }, { status: 408 })
      }
      
      throw fetchError
    }
  } catch (error) {
    console.error("❌ Thumbnail proxy error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

