import { GoogleGenerativeAI } from "@google/generative-ai"
import { getDownloadUrl } from "@/lib/drive"

// Initialize Gemini AI client
function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }

  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
}

// Download image from Google Drive
async function downloadImage(fileId: string): Promise<Buffer> {
  const downloadUrl = getDownloadUrl(fileId)

  const response = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "Drive-Image-Searcher/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Convert buffer to base64 data URL
function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString("base64")
  return `data:${mimeType};base64,${base64}`
}

// Caption an image using Gemini 2.5 Flash
export async function captionImage(
  fileId: string,
  mimeType: string,
): Promise<{
  caption: string
  tags: string[]
}> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

  try {
    // Download the image
    const imageBuffer = await downloadImage(fileId)
    const dataUrl = bufferToDataUrl(imageBuffer, mimeType)

    // Prepare the prompt
    const prompt = `You are an image captioning assistant. Analyze this image and provide a concise, literal description (2-3 sentences). Avoid speculation and brand identification unless clearly visible. 

Return your response as JSON in this exact format:
{
  "caption": "A clear, factual description of what you see in the image",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

The caption should be descriptive but concise. Tags should be 3-8 short nouns or adjectives that describe key elements, colors, objects, or concepts in the image.`

    // Generate content
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType,
        },
      },
    ])

    const response = await result.response
    const text = response.text()

    // Parse JSON response
    try {
      const parsed = JSON.parse(text)

      if (!parsed.caption || !Array.isArray(parsed.tags)) {
        throw new Error("Invalid response format")
      }

      // Clean and validate the response
      const caption = parsed.caption.trim().substring(0, 500) // Limit caption length
      const tags = parsed.tags
        .slice(0, 8) // Limit to 8 tags
        .map((tag: string) => tag.toLowerCase().trim().replace(/\s+/g, "-"))
        .filter((tag: string) => tag.length > 0 && tag.length <= 20)

      return { caption, tags }
    } catch (parseError) {
      // Fallback: extract caption from raw text
      const fallbackCaption = text.trim().substring(0, 500)
      const fallbackTags = ["image", "content"]

      console.warn("Failed to parse JSON response, using fallback:", parseError)
      return { caption: fallbackCaption, tags: fallbackTags }
    }
  } catch (error) {
    console.error("Gemini captioning error:", error)
    throw new Error(`Failed to caption image: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

// Generate text embedding for search
export async function generateTextEmbedding(text: string): Promise<number[]> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" })

  try {
    const result = await model.embedContent(text)
    const embedding = result.embedding

    if (!embedding.values || embedding.values.length === 0) {
      throw new Error("Empty embedding returned")
    }

    return embedding.values
  } catch (error) {
    console.error("Embedding generation error:", error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

// Generate embeddings for both caption and tags
export async function generateCaptionEmbedding(caption: string, tags: string[]): Promise<number[]> {
  // Combine caption and tags for richer semantic representation
  const combinedText = `${caption} ${tags.join(" ")}`
  return generateTextEmbedding(combinedText)
}

// Rate limiting helper
class RateLimiter {
  private requests: number[] = []
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now()

    // Remove old requests outside the window
    this.requests = this.requests.filter((time) => now - time < this.windowMs)

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests)
      const waitTime = this.windowMs - (now - oldestRequest)

      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }

    this.requests.push(now)
  }
}

// Global rate limiter: 60 requests per minute
export const geminiRateLimiter = new RateLimiter(60, 60 * 1000)
