import { GoogleGenerativeAI } from "@google/generative-ai"
import { getDownloadUrl, getAuthenticatedDownloadUrl } from "@/lib/drive"

// Initialize Gemini AI client
function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }

  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
}

// Download image from Google Drive with retry logic and timeout protection
async function downloadWithRetry(fileId: string, maxRetries = 3): Promise<Buffer> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏬ Attempt ${attempt}/${maxRetries} downloading image: ${fileId}`)
      
      // Rate limit Google Drive requests
      await driveRateLimiter.waitIfNeeded()
      
      const downloadUrl = getDownloadUrl(fileId)
      
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      const response = await fetch(downloadUrl, {
        headers: {
          "User-Agent": "Drive-Image-Searcher/1.0",
        },
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      console.log(`✅ Successfully downloaded image: ${fileId} (${buffer.length} bytes)`)
      return buffer
      
    } catch (error: unknown) {
      const isLastAttempt = attempt === maxRetries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      console.log(`❌ Download attempt ${attempt}/${maxRetries} failed for ${fileId}: ${errorMessage}`)
      
      if (isLastAttempt) {
        // Try alternative download URL on final attempt
        try {
          console.log(`🔄 Trying alternative download URL for ${fileId}`)
          
          // Rate limit the alternative request too
          await driveRateLimiter.waitIfNeeded()
          
          const alternativeUrl = getAuthenticatedDownloadUrl(fileId)
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)
          
          const response = await fetch(alternativeUrl, {
            headers: {
              "User-Agent": "Drive-Image-Searcher/1.0",
            },
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          
          console.log(`✅ Alternative download successful for ${fileId} (${buffer.length} bytes)`)
          return buffer
          
        } catch (altError: unknown) {
          const altErrorMessage = altError instanceof Error ? altError.message : 'Unknown error'
          console.error(`💀 All download attempts failed for ${fileId}:`, altErrorMessage)
          throw new Error(`Failed to download image after ${maxRetries} attempts: ${errorMessage}`)
        }
      }
      
      // Exponential backoff: 2^attempt seconds + jitter
      const baseDelay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
      const jitter = Math.random() * 1000 // 0-1s random jitter
      const delay = baseDelay + jitter
      
      console.log(`⏳ Waiting ${Math.round(delay)}ms before retry ${attempt + 1}/${maxRetries}`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw new Error(`Should never reach here`)
}

// Legacy function for backward compatibility
async function downloadImage(fileId: string): Promise<Buffer> {
  return downloadWithRetry(fileId, 3)
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" })

  try {
    // Download the image with timing
    const downloadStart = Date.now()
    const imageBuffer = await downloadImage(fileId)
    const downloadTime = Date.now() - downloadStart
    console.log(`⏱️  Download time for ${fileId}: ${downloadTime}ms`)

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

    // Clean the response text to handle markdown formatting
    let cleanedText = text.trim()
    
    // Remove markdown code blocks if present
    if (cleanedText.startsWith('```json') && cleanedText.endsWith('```')) {
      cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (cleanedText.startsWith('```') && cleanedText.endsWith('```')) {
      cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }
    
    // Remove any leading/trailing whitespace
    cleanedText = cleanedText.trim()

    // Parse JSON response
    try {
      const parsed = JSON.parse(cleanedText)

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
      console.warn("Raw response text:", text)
      console.warn("Cleaned text:", cleanedText)
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

// Rate limiters
// Global rate limiter: 4,000 requests per minute for Gemini
export const geminiRateLimiter = new RateLimiter(4000, 60 * 1000)

// Google Drive rate limiter: 10,000 requests per minute (buffer for 12,000 quota)
export const driveRateLimiter = new RateLimiter(10000, 60 * 1000)
