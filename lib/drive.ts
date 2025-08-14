import { google } from "googleapis"

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
    await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
    })

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
      images: response.data.files || [],
      count: response.data.files?.length || 0,
    }
  } catch (error: any) {
    console.error("Drive API error:", error)

    if (error.code === 403 || error.code === 404) {
      return {
        success: false,
        error:
          "The folder isn't publicly accessible. Please set sharing to 'Anyone with the link' (viewer) and try again.",
        images: [],
        count: 0,
      }
    }

    return {
      success: false,
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
