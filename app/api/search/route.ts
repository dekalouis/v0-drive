import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateTextEmbedding } from "@/lib/gemini"
import { findMostSimilar } from "@/lib/vector"

// Helper function to clean captions
function cleanCaption(caption?: string): string | null {
  if (!caption) return null
  
  // If caption contains JSON structure, extract just the caption text
  if (caption.includes('"caption"')) {
    try {
      const parsed = JSON.parse(caption)
      return parsed.caption || caption
    } catch {
      // If parsing fails, return as is
      return caption
    }
  }
  
  return caption
}

export async function POST(request: NextRequest) {
  try {
    const { folderId, query, topK = 12 } = await request.json()

    if (!folderId || !query) {
      return NextResponse.json({ error: "folderId and query are required" }, { status: 400 })
    }

    if (typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Query must be a non-empty string" }, { status: 400 })
    }

    // Validate topK
    const maxResults = Math.min(Math.max(1, Number.parseInt(topK) || 12), 50)

    // Generate query embedding
    const queryEmbedding = await generateTextEmbedding(query.trim())

    // Get all completed images
    const images = await prisma.image.findMany({
      where: {
        folderId,
        status: "completed",
      },
      select: {
        id: true,
        fileId: true,
        name: true,
        thumbnailLink: true,
        webViewLink: true,
        caption: true,
        tags: true,
        captionVec: true,
      },
    })

    if (images.length === 0) {
      return NextResponse.json({
        results: [],
        message: "No processed images found for search",
      })
    }

    // Prepare candidates for similarity search - filter for images with embeddings
    const candidates = images
      .filter((img) => img.captionVec && Array.isArray(img.captionVec))
      .map((img) => ({
        ...img,
        vector: img.captionVec as number[],
      }))

    if (candidates.length === 0) {
      return NextResponse.json({
        results: [],
        message: "No images with embeddings found",
      })
    }

    // Find most similar images
    const results = findMostSimilar(queryEmbedding, candidates, maxResults)

    // Format results - remove unused variables and clean captions
    const formattedResults = results.map(({ similarity, ...image }) => ({
      ...image,
      caption: cleanCaption(image.caption as string | undefined), // Type assertion for caption
      similarity: Math.round(similarity * 1000) / 1000, // Round to 3 decimal places
    }))

    return NextResponse.json({
      results: formattedResults,
      query,
      totalCandidates: candidates.length,
    })
  } catch (error) {
    console.error("Search API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
