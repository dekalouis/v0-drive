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

// Comprehensive structured prompt for rich image analysis
const STRUCTURED_CAPTION_PROMPT = `You are an expert image analysis assistant optimized for semantic search. Analyze this image thoroughly and extract comprehensive metadata.

## Instructions
Examine the image carefully and provide detailed information for each category below. Be factual and specific. If a category doesn't apply, use null or empty array.

## Required Output Format (JSON)
{
  "subjects": {
    "people": {
      "count": number or "none" or "many",
      "descriptions": ["description of each person/group"],
      "actions": ["what they are doing"],
      "emotions": ["visible emotional states"],
      "attire": ["clothing/uniforms descriptions"]
    },
    "objects": ["list of significant objects with colors/details"],
    "animals": ["list of animals if any"],
    "text_visible": ["any readable text, signs, logos, labels - OCR"]
  },
  "context": {
    "setting": "indoor/outdoor/studio/etc",
    "location_type": "specific location type (stadium, office, beach, etc)",
    "time_of_day": "morning/afternoon/evening/night/unclear",
    "weather": "if outdoor and visible",
    "lighting": "natural/artificial/mixed, quality description"
  },
  "visual_style": {
    "photography_type": "portrait/landscape/action/macro/aerial/etc",
    "composition": "centered/rule-of-thirds/symmetrical/etc",
    "colors": {
      "dominant": ["main colors"],
      "mood": "warm/cool/neutral/vibrant/muted"
    },
    "quality": "professional/amateur/candid/staged"
  },
  "summary": {
    "main_caption": "2-3 sentence comprehensive description of the image",
    "search_keywords": ["10-15 relevant search terms that someone might use to find this image"]
  }
}

## Guidelines
- Be literal and factual - describe what you SEE
- Include colors, quantities, and spatial relationships
- Extract ALL visible text (OCR) - signs, labels, watermarks, etc.
- For sports/action: describe the specific activity, equipment, team colors
- For people: note approximate age range, gender if clear, expressions
- Keywords should include synonyms and related terms for better search matching`

// Caption an image using Gemini 2.0 Flash with comprehensive analysis
export async function captionImage(
  fileId: string,
  mimeType: string,
): Promise<{
  caption: string
  tags: string[]
}> {
  const genAI = getGeminiClient()
  // Use gemini-2.0-flash for better captioning quality (not lite)
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

  try {
    // Download the image with timing
    const downloadStart = Date.now()
    const imageBuffer = await downloadImage(fileId)
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

    // Parse JSON response and build comprehensive caption
    try {
      const parsed = JSON.parse(cleanedText)
      
      // Build a rich, searchable caption from structured data
      const captionParts: string[] = []
      
      // Main caption
      if (parsed.summary?.main_caption) {
        captionParts.push(parsed.summary.main_caption)
      }
      
      // Add subject details
      if (parsed.subjects) {
        const { people, objects, animals, text_visible } = parsed.subjects
        
        if (people?.descriptions?.length > 0) {
          captionParts.push(`People: ${people.descriptions.join(', ')}`)
        }
        if (people?.actions?.length > 0) {
          captionParts.push(`Actions: ${people.actions.join(', ')}`)
        }
        if (people?.attire?.length > 0) {
          captionParts.push(`Attire: ${people.attire.join(', ')}`)
        }
        if (objects?.length > 0) {
          captionParts.push(`Objects: ${objects.join(', ')}`)
        }
        if (animals?.length > 0) {
          captionParts.push(`Animals: ${animals.join(', ')}`)
        }
        if (text_visible?.length > 0) {
          captionParts.push(`Visible text: ${text_visible.join(', ')}`)
        }
      }
      
      // Add context
      if (parsed.context) {
        const { setting, location_type, time_of_day, weather, lighting } = parsed.context
        const contextParts = [setting, location_type, time_of_day, weather, lighting].filter(Boolean)
        if (contextParts.length > 0) {
          captionParts.push(`Context: ${contextParts.join(', ')}`)
        }
      }
      
      // Add visual style
      if (parsed.visual_style) {
        const { photography_type, colors } = parsed.visual_style
        if (photography_type) {
          captionParts.push(`Style: ${photography_type}`)
        }
        if (colors?.dominant?.length > 0) {
          captionParts.push(`Colors: ${colors.dominant.join(', ')}`)
        }
      }
      
      // Combine into final caption (limit to 1500 chars for embedding efficiency)
      const caption = captionParts.join('. ').substring(0, 1500)
      
      // Extract tags from search_keywords and other fields
      const tags: string[] = []
      
      // Add search keywords
      if (parsed.summary?.search_keywords) {
        tags.push(...parsed.summary.search_keywords)
      }
      
      // Add additional tags from structured data
      if (parsed.subjects?.objects) tags.push(...parsed.subjects.objects.slice(0, 5))
      if (parsed.subjects?.people?.actions) tags.push(...parsed.subjects.people.actions)
      if (parsed.context?.setting) tags.push(parsed.context.setting)
      if (parsed.context?.location_type) tags.push(parsed.context.location_type)
      if (parsed.visual_style?.photography_type) tags.push(parsed.visual_style.photography_type)
      if (parsed.visual_style?.colors?.dominant) tags.push(...parsed.visual_style.colors.dominant)
      
      // Clean and deduplicate tags
      const cleanedTags = [...new Set(
        tags
          .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
          .map(tag => tag.toLowerCase().trim().replace(/\s+/g, '-'))
          .filter(tag => tag.length > 0 && tag.length <= 30)
      )].slice(0, 20) // Allow more tags for richer search

      console.log(`📝 Generated comprehensive caption for ${fileId}: ${caption.substring(0, 100)}...`)
      console.log(`🏷️  Generated ${cleanedTags.length} tags for ${fileId}`)

      return { caption, tags: cleanedTags }
    } catch (parseError) {
      // Fallback: try to extract useful info from raw text
      console.warn("Failed to parse structured JSON response, using fallback:", parseError)
      console.warn("Raw response (first 500 chars):", text.substring(0, 500))
      
      // Try to extract any useful text as caption
      const fallbackCaption = text
        .replace(/```json\n?|\n?```/g, '')
        .replace(/[{}\[\]"]/g, ' ')
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
    
    const thumbnailUrl = fileResponse.data.thumbnailLink
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
