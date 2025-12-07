import { google, drive_v3 } from "googleapis"

// Type for Drive file metadata
export type DriveFile = drive_v3.Schema$File

// Initialize Google Drive API client
export function getDriveClient() {
  if (!process.env.GOOGLE_DRIVE_API_KEY) {
    throw new Error("GOOGLE_DRIVE_API_KEY environment variable is required")
  }

  return google.drive({
    version: "v3",
    auth: process.env.GOOGLE_DRIVE_API_KEY,
  })
}

/**
 * Extract folder ID from various Google Drive URL formats
 */
export function extractFolderId(folderUrl: string): string | null {
  try {
    const url = new URL(folderUrl)

    // Handle different URL formats:
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    // https://drive.google.com/open?id=FOLDER_ID

    if (url.pathname.includes("/folders/")) {
      const match = url.pathname.match(/\/folders\/([a-zA-Z0-9-_]+)/)
      return match ? match[1] : null
    }

    if (url.searchParams.has("id")) {
      return url.searchParams.get("id")
    }

    return null
  } catch {
    return null
  }
}

/**
 * Validate that a folder is publicly accessible and list its images
 */
export async function validateAndListImages(folderId: string) {
  const drive = getDriveClient()

  try {
    // First, try to get folder metadata to validate access
    const folderResponse = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
    })

    const folderName = folderResponse.data.name || null

    // List all images in the folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: "files(id,name,mimeType,thumbnailLink,webViewLink,size,md5Checksum,modifiedTime,version)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
    })

    return {
      success: true,
      folderName,
      images: response.data.files || [],
      count: response.data.files?.length || 0,
    }
  } catch (error: unknown) {
    console.error("Drive API error:", error)

    if (error && typeof error === 'object' && 'code' in error) {
      const driveError = error as { code: number }
      if (driveError.code === 403 || driveError.code === 404) {
        return {
          success: false,
          folderName: null,
          error: "The folder isn't publicly accessible. Please set sharing to 'Anyone with the link' (viewer) and try again.",
          images: [],
          count: 0,
        }
      }
    }

    return {
      success: false,
      folderName: null,
      error: "Failed to access the folder. Please check the URL and try again.",
      images: [],
      count: 0,
    }
  }
}

/**
 * Recursively list all images in a folder and its subfolders
 */
export async function listImagesRecursively(folderId: string): Promise<{
  success: boolean
  folderName: string | null
  images: DriveFile[]
  count: number
  error?: string
}> {
  const drive = getDriveClient()
  const allImages: DriveFile[] = []

  try {
    // Get folder metadata
    const folderResponse = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
    })
    const folderName = folderResponse.data.name || null

    // Helper function to recursively scan folders
    async function scanFolder(currentFolderId: string, nextPageToken?: string): Promise<void> {
      // List all files (images and folders) in current folder
      const response = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed=false`,
        fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,size,md5Checksum,modifiedTime,version)",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 1000,
        pageToken: nextPageToken,
      })

      const files = response.data.files || []
      
      for (const file of files) {
        if (file.mimeType?.startsWith("image/")) {
          // It's an image - add to results
          allImages.push(file)
        } else if (file.mimeType === "application/vnd.google-apps.folder" && file.id) {
          // It's a subfolder - recursively scan it
          console.log(`📂 Scanning subfolder: ${file.name}`)
          await scanFolder(file.id)
        }
      }

      // Handle pagination
      if (response.data.nextPageToken) {
        await scanFolder(currentFolderId, response.data.nextPageToken)
      }
    }

    // Start recursive scan from root folder
    console.log(`🔍 Starting recursive scan of folder: ${folderName}`)
    await scanFolder(folderId)
    console.log(`✅ Found ${allImages.length} total images (including subfolders)`)

    return {
      success: true,
      folderName,
      images: allImages,
      count: allImages.length,
    }
  } catch (error: unknown) {
    console.error("Drive API error during recursive listing:", error)

    if (error && typeof error === "object" && "code" in error) {
      const driveError = error as { code: number }
      if (driveError.code === 403 || driveError.code === 404) {
        return {
          success: false,
          folderName: null,
          error: "The folder isn't publicly accessible. Please set sharing to 'Anyone with the link' (viewer) and try again.",
          images: [],
          count: 0,
        }
      }
    }

    return {
      success: false,
      folderName: null,
      error: "Failed to access the folder. Please check the URL and try again.",
      images: [],
      count: 0,
    }
  }
}

/**
 * Get download URL for a Drive file
 */
export function getDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}

/**
 * Get alternative download URL with authentication
 */
export function getAuthenticatedDownloadUrl(fileId: string): string {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${process.env.GOOGLE_DRIVE_API_KEY}`
}

/**
 * Get fresh thumbnail URL for a file from Google Drive API
 * @param fileId - The Google Drive file ID
 * @param size - Optional thumbnail size (default 220px)
 * @returns Fresh thumbnail URL or null if not available
 */
export async function getFreshThumbnailUrl(fileId: string, size: number = 220): Promise<string | null> {
  const drive = getDriveClient()

  try {
    const response = await drive.files.get({
      fileId,
      fields: "thumbnailLink",
    })

    const thumbnailLink = response.data.thumbnailLink
    if (!thumbnailLink) {
      return null
    }

    // Modify the thumbnail size if needed (default is s220)
    // Google Drive thumbnail URLs end with =sXXX where XXX is the size
    if (size !== 220) {
      return thumbnailLink.replace(/=s\d+$/, `=s${size}`)
    }

    return thumbnailLink
  } catch (error: unknown) {
    console.error(`Failed to get thumbnail for file ${fileId}:`, error)
    return null
  }
}

/**
 * Validate folder URL format
 */
export function isValidDriveUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return (
      parsedUrl.hostname === "drive.google.com" &&
      (parsedUrl.pathname.includes("/folders/") || parsedUrl.searchParams.has("id"))
    )
  } catch {
    return false
  }
}
