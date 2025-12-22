import { GoogleGenerativeAI } from "@google/generative-ai"
import { getDownloadUrl, getAuthenticatedDownloadUrl, getDriveClient } from "@/lib/drive"

// Initialize Gemini AI client
function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }

  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
}

// Download image from Google Drive with retry logic and timeout protection
async function downloadWithRetry(fileId: string, maxRetries = 3, accessToken?: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏬ Attempt ${attempt}/${maxRetries} downloading image: ${fileId}`)

      // Rate limit Google Drive requests
      await driveRateLimiter.waitIfNeeded()

      // If accessToken is provided, use authenticated download URL (always works if token valid)
      // Otherwise use public download URL
      const downloadUrl = accessToken ? getAuthenticatedDownloadUrl(fileId) : getDownloadUrl(fileId)

      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const headers: Record<string, string> = {
        "User-Agent": "Drive-Image-Searcher/1.0",
      }

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      const response = await fetch(downloadUrl, {
        headers,
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

          const headers: Record<string, string> = {
            "User-Agent": "Drive-Image-Searcher/1.0",
          }

          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`
          }

          const response = await fetch(alternativeUrl, {
            headers,
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
async function downloadImage(fileId: string, accessToken?: string): Promise<Buffer> {
  return downloadWithRetry(fileId, 3, accessToken)
}

// Optimized structured prompt for semantic search - targets 120-200 tokens output
const STRUCTURED_CAPTION_PROMPT = `You are generating search-ready captions for an image dataset.
Return structured MARKDOWN with these sections (omit section only if completely empty):

1. **Subjects & Objects:** list every distinct person, object, brand, animal, product, or UI element. Include counts, colors, positions (e.g., "two golden retrievers sitting on a red sofa").
2. **Actions & Interactions:** describe what each subject is doing, including gestures, emotions, gaze, and relationships.
3. **Setting & Context:** indoor/outdoor, environment type, time of day/lighting, weather, notable background elements.
4. **Visual Attributes:** colors, textures, materials, camera angle, depth-of-field, style (photo, illustration, screenshot, UI mock, chart, etc.).
5. **Visible Text (OCR):** quote any readable words, signage, UI labels, packaging text exactly.
6. **Notable Details:** rare logos, devices, clothing, accessories, body language, mood, any anomalies.
7. **Search Keywords:** comma-separated list of 10-15 high-signal terms (nouns, verbs, styles, brands) to aid embedding.

Guidelines:
- Be exhaustive but concise—aim for 120-200 tokens total.
- Use neutral, descriptive language; avoid speculation.
- When unsure, say "uncertain" rather than hallucinating.
- Do NOT mention "section omitted" or anything outside the format above.`

// Caption an image using Gemini 2.5 Flash with comprehensive analysis
export async function captionImage(
  fileId: string,
  mimeType: string,
  accessToken?: string
): Promise<{
  caption: string
  tags: string[]
}> {
  const genAI = getGeminiClient()
  // Use gemini-2.5-flash for best captioning quality
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" })

  try {
    // Download the image (prefer thumbnail for speed)
    const downloadStart = Date.now()
    // Download full image (best quality for detailed captions)
    const imageBuffer = await downloadImage(fileId, accessToken)
    const downloadTime = Date.now() - downloadStart
    console.log(`⏱️  Download time for ${fileId}: ${downloadTime}ms`)

    // Generate content with comprehensive prompt
    const aiStart = Date.now()
    const result = await model.generateContent([
      STRUCTURED_CAPTION_PROMPT,
      {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType,
        },
      },
    ])
    const aiTime = Date.now() - aiStart
    console.log(`⏱️  AI analysis time for ${fileId}: ${aiTime}ms`)

    const response = await result.response
    const text = response.text()

    // Parse markdown response and extract caption + tags
    try {
      const cleanedText = text.trim()

      // Extract Search Keywords section for tags
      const tags: string[] = []
      const keywordsMatch = cleanedText.match(/\*\*Search Keywords:\*\*\s*([^\n*]+)/i)
      if (keywordsMatch) {
        const keywords = keywordsMatch[1]
          .split(',')
          .map(k => k.trim().toLowerCase().replace(/\s+/g, '-'))
          .filter(k => k.length > 0 && k.length <= 30)
        tags.push(...keywords)
      }

      // Also extract keywords from other sections for richer tagging
      const subjectsMatch = cleanedText.match(/\*\*Subjects & Objects:\*\*\s*([^\n*]+)/i)
      if (subjectsMatch) {
        const subjects = subjectsMatch[1]
          .split(',')
          .slice(0, 5)
          .map(s => s.trim().toLowerCase().replace(/\s+/g, '-'))
          .filter(s => s.length > 0 && s.length <= 30)
        tags.push(...subjects)
      }

      // Build caption from the full markdown (without the Search Keywords line for cleaner display)
      const caption = cleanedText
        .replace(/\*\*Search Keywords:\*\*[^\n]*/gi, '') // Remove keywords line
        .replace(/\*\*/g, '') // Remove bold markers
        .replace(/^\d+\.\s*/gm, '') // Remove numbered list markers
        .replace(/\n{2,}/g, ' ') // Collapse multiple newlines
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .substring(0, 1500) // Limit for embedding efficiency

      // Clean and deduplicate tags
      const cleanedTags = [...new Set(
        tags
          .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
          .filter(tag => tag.length > 0 && tag.length <= 30)
      )].slice(0, 20) // Allow more tags for richer search

      console.log(`📝 Generated caption for ${fileId}: ${caption.substring(0, 100)}...`)
      console.log(`🏷️  Generated ${cleanedTags.length} tags for ${fileId}`)

      return { caption, tags: cleanedTags }
    } catch (parseError) {
      // Fallback: use raw text as caption
      console.warn("Failed to parse markdown response, using fallback:", parseError)
      console.warn("Raw response (first 500 chars):", text.substring(0, 500))

      const fallbackCaption = text
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 500)

      // Extract potential keywords from the text
      const wordPattern = /\b[a-zA-Z]{3,15}\b/g
      const words = fallbackCaption.match(wordPattern) || []
      const fallbackTags = [...new Set(words.map(w => w.toLowerCase()))].slice(0, 10)

      return {
        caption: fallbackCaption || "Image content",
        tags: fallbackTags.length > 0 ? fallbackTags : ["image", "content"]
      }
    }
  } catch (error) {
    console.error("Gemini captioning error:", error)
    throw new Error(`Failed to caption image: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

// Normalize text for consistent embedding and search matching
// This ensures case-insensitive matching and consistent whitespace handling
export function normalizeTextForEmbedding(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Generate text embedding for search
export async function generateTextEmbedding(text: string, normalize: boolean = true): Promise<number[]> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" })

  try {
    // Normalize text for consistent embedding matching
    const processedText = normalize ? normalizeTextForEmbedding(text) : text

    const result = await model.embedContent(processedText)
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
  // Normalization is applied inside generateTextEmbedding
  return generateTextEmbedding(combinedText, true)
}

// Fast tags-only image analysis using Gemini (optimized for quick processing)
export async function extractImageTags(
  fileId: string,
  mimeType: string,
  useThumbnail: boolean = true
): Promise<{
  tags: string[]
  quickDescription?: string
}> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" })

  // Retry configuration for network failures
  const maxRetries = 3
  const baseDelay = 2000 // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🏷️  Extracting tags for ${fileId} (thumbnail: ${useThumbnail}) - Attempt ${attempt}/${maxRetries}`)

      // Rate limiting
      await geminiRateLimiter.waitIfNeeded()

      // Download image (thumbnail or full) with timeout
      const downloadStart = Date.now()
      const imageBuffer = useThumbnail
        ? await downloadThumbnail(fileId, 3)
        : await downloadWithRetry(fileId, 3)
      const downloadTime = Date.now() - downloadStart
      console.log(`⏱️  Download time for ${fileId}: ${downloadTime}ms`)

      // Convert buffer to base64 for Gemini
      const base64Image = imageBuffer.toString('base64')

      const prompt = `Analyze this image and extract 8-12 key visual tags for search indexing. Focus on:

- Main subjects (people, animals, objects)
- Actions and activities
- Setting and environment (indoor/outdoor, location type)
- Colors and visual style
- Any visible text, logos, or signs (OCR)
- Mood and atmosphere

Return ONLY a JSON object with this exact format:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "quickDescription": "Brief one-sentence description of the image"
}`

      const aiStart = Date.now()
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        prompt,
      ])
      const aiTime = Date.now() - aiStart

      const response = await result.response
      const text = response.text()
      console.log(`⏱️  AI processing time: ${aiTime}ms`)

      try {
        // Parse JSON response
        const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())

        const tags = Array.isArray(parsed.tags) ? parsed.tags : []
        const quickDescription = parsed.quickDescription || `Image with tags: ${tags.slice(0, 3).join(', ')}`

        console.log(`🏷️  Generated tags for ${fileId}: [${tags.join(', ')}]`)

        return {
          tags,
          quickDescription
        }
      } catch {
        console.warn(`Failed to parse JSON response: ${text}`)
        // Fallback: extract tags from text
        const fallbackTags = text
          .split(',')
          .map(tag => tag.trim().replace(/[^\w\s]/g, ''))
          .filter(tag => tag.length > 0)
          .slice(0, 8)

        return {
          tags: fallbackTags.length > 0 ? fallbackTags : ['image', 'content'],
          quickDescription: `Image with content: ${fallbackTags.slice(0, 3).join(', ')}`
        }
      }
    } catch (error) {
      const isLastAttempt = attempt === maxRetries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      console.error(`Fast tagging error (attempt ${attempt}/${maxRetries}):`, errorMessage)

      if (isLastAttempt) {
        console.error(`💀 All tagging attempts failed for ${fileId}:`, errorMessage)
        throw new Error(`Failed to extract tags: ${errorMessage}`)
      } else {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
        console.log(`⏳ Retrying in ${Math.round(delay)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // This should never be reached due to the throw in the catch block
  throw new Error(`Failed to extract tags after ${maxRetries} attempts`)
}

// Download thumbnail image from Google Drive
async function downloadThumbnail(fileId: string, maxRetries = 3): Promise<Buffer> {
  // First, get the thumbnail URL from the API
  const drive = getDriveClient()

  try {
    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: "thumbnailLink"
    })

    // Request a large thumbnail (1024px)
    let thumbnailUrl = fileResponse.data.thumbnailLink
    if (thumbnailUrl) {
      // Modify URL to get a larger version if possible (s220 is default, change to s1024)
      thumbnailUrl = thumbnailUrl.replace(/=s\d+/, '=s1024')
    }

    if (!thumbnailUrl) {
      throw new Error("No thumbnail available, falling back to full image")
    }

    console.log(`📸 Downloading thumbnail: ${fileId}`)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Rate limit Google Drive requests
        await driveRateLimiter.waitIfNeeded()

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // Shorter timeout for thumbnails

        const response = await fetch(thumbnailUrl, {
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

        console.log(`✅ Successfully downloaded thumbnail: ${fileId} (${buffer.length} bytes)`)
        return buffer

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.log(`❌ Thumbnail download attempt ${attempt}/${maxRetries} failed: ${errorMessage}`)

        if (attempt === maxRetries) {
          throw new Error(`Failed to download thumbnail after ${maxRetries} attempts`)
        }

        // Short backoff for thumbnails
        const delay = Math.pow(1.5, attempt) * 500 // 750ms, 1.1s, 1.7s
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error("Should never reach here")

  } catch {
    console.warn(`Thumbnail not available for ${fileId}, falling back to full image`)
    return downloadWithRetry(fileId, maxRetries)
  }
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
