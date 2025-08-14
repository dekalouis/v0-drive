"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Search, Image as ImageIcon, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"

interface Image {
  id: string
  fileId: string
  name: string
  thumbnailLink: string
  webViewLink: string
  status: string
  caption?: string
  tags?: string
  similarity?: number
}

interface Folder {
  id: string
  folderId: string
  status: string
  totalImages: number
  processedImages: number
  images: Image[]
}

export default function FolderPage() {
  const params = useParams()
  const folderId = params.id as string
  
  const [folder, setFolder] = useState<Folder | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Image[]>([])
  const [searching, setSearching] = useState(false)
  const [retryingImages, setRetryingImages] = useState<Set<string>>(new Set())
  const [retryingAll, setRetryingAll] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [imagesPerPage, setImagesPerPage] = useState(25)

  useEffect(() => {
    fetchFolderData()
    const interval = setInterval(fetchFolderData, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [folderId])

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const fetchFolderData = async () => {
    try {
      const response = await fetch(`/api/images?folderId=${folderId}`)
      if (response.ok) {
        const data = await response.json()
        setFolder(data)
        setLoading(false)
      }
    } catch (error) {
      console.error("Error fetching folder data:", error)
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, folderId }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.results || [])
      }
    } catch (error) {
      console.error("Search error:", error)
    } finally {
      setSearching(false)
    }
  }

  const handleRetryImage = async (imageId: string) => {
    setRetryingImages(prev => new Set(prev).add(imageId))
    
    try {
      const response = await fetch("/api/retry-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      })
      
      if (response.ok) {
        console.log("Image queued for retry")
        // Refresh data after a short delay
        setTimeout(fetchFolderData, 1000)
      } else {
        console.error("Failed to retry image")
      }
    } catch (error) {
      console.error("Retry error:", error)
    } finally {
      setRetryingImages(prev => {
        const newSet = new Set(prev)
        newSet.delete(imageId)
        return newSet
      })
    }
  }

  const handleRetryAllFailed = async () => {
    setRetryingAll(true)
    
    try {
      const response = await fetch("/api/retry-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(data.message)
        // Refresh data after a short delay
        setTimeout(fetchFolderData, 1000)
      } else {
        console.error("Failed to retry failed images")
      }
    } catch (error) {
      console.error("Retry all error:", error)
    } finally {
      setRetryingAll(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500"
      case "processing": return "bg-yellow-500"
      case "failed": return "bg-red-500"
      default: return "bg-gray-500"
    }
  }

  // Sort images: failed first, then by status
  const sortImages = (images: Image[]) => {
    return [...images].sort((a, b) => {
      if (a.status === "failed" && b.status !== "failed") return -1
      if (a.status !== "failed" && b.status === "failed") return 1
      return 0
    })
  }

  // Pagination logic
  const allImages = searchQuery ? searchResults : sortImages(folder?.images || [])
  const totalPages = Math.ceil(allImages.length / imagesPerPage)
  const startIndex = (currentPage - 1) * imagesPerPage
  const endIndex = startIndex + imagesPerPage
  const currentImages = allImages.slice(startIndex, endIndex)

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = []
    const maxVisiblePages = 5
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }

  // Pagination component
  const Pagination = ({ position }: { position: 'top' | 'bottom' }) => (
    <div className={`flex items-center justify-between ${position === 'top' ? 'mb-4' : 'mt-6'}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          <select
            value={imagesPerPage}
            onChange={(e) => {
              setImagesPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span className="text-sm text-muted-foreground">per page</span>
        </div>
        
        <div className="text-sm text-muted-foreground">
          Showing {startIndex + 1}-{Math.min(endIndex, allImages.length)} of {allImages.length} images
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) => (
              <div key={index}>
                {page === '...' ? (
                  <span className="px-2 py-1 text-sm text-muted-foreground">...</span>
                ) : (
                  <Button
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page as number)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading folder...</p>
        </div>
      </div>
    )
  }

  if (!folder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Folder Not Found</CardTitle>
            <CardDescription>The requested folder could not be found.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const progressPercentage = folder.totalImages > 0 ? (folder.processedImages / folder.totalImages) * 100 : 0
  const failedImages = folder.images.filter(img => img.status === "failed")

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Google Drive Images</h1>
              <p className="text-muted-foreground">
                Folder ID: {folder.folderId}
              </p>
            </div>
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              Search New Folder
            </Button>
          </div>
          
          {/* Status and Progress */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Badge className={getStatusColor(folder.status)}>
                    {folder.status}
                  </Badge>
                  Processing Status
                </CardTitle>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {folder.processedImages} / {folder.totalImages} images
                  </div>
                  {failedImages.length > 0 && (
                    <Button
                      onClick={handleRetryAllFailed}
                      disabled={retryingAll}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      {retryingAll ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Retry All Failed ({failedImages.length})
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercentage} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                {folder.status === "processing" && "Images are being processed in the background..."}
                {folder.status === "completed" && "All images have been processed!"}
                {folder.status === "failed" && "Processing failed. Please try again."}
              </p>
            </CardContent>
          </Card>

          {/* Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Images
              </CardTitle>
              <CardDescription>
                Search through your images using natural language queries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 'a cat sitting on a chair' or 'landscape with mountains'"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Pagination */}
        {allImages.length > 0 && <Pagination position="top" />}

        {/* Images Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {currentImages.map((image) => (
            <Card key={image.id} className={`overflow-hidden ${image.status === "failed" ? "opacity-60" : ""}`}>
              <div className="aspect-square relative">
                {image.fileId ? (
                  <img
                    src={`/api/image-proxy?fileId=${image.fileId}`}
                    alt={image.name}
                    className={`w-full h-full object-cover ${image.status === "failed" ? "grayscale blur-sm" : ""}`}
                    onError={(e) => {
                      // Fallback to thumbnail link if proxy fails
                      if (image.thumbnailLink) {
                        e.currentTarget.src = `/api/image-proxy?url=${encodeURIComponent(image.thumbnailLink)}`
                      } else {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling?.classList.remove('hidden')
                      }
                    }}
                  />
                ) : image.thumbnailLink ? (
                  <img
                    src={`/api/image-proxy?url=${encodeURIComponent(image.thumbnailLink)}`}
                    alt={image.name}
                    className={`w-full h-full object-cover ${image.status === "failed" ? "grayscale blur-sm" : ""}`}
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                {/* Fallback placeholder */}
                <div className="w-full h-full bg-muted flex items-center justify-center hidden">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                
                {/* Status badge */}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="text-xs">
                    {image.status}
                  </Badge>
                </div>
                
                {/* Retry button for failed images */}
                {image.status === "failed" && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <Button
                      onClick={() => handleRetryImage(image.id)}
                      disabled={retryingImages.has(image.id)}
                      size="sm"
                      className="bg-white/90 hover:bg-white text-black"
                    >
                      {retryingImages.has(image.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Retry
                    </Button>
                  </div>
                )}
                
                {image.similarity && (
                  <div className="absolute bottom-2 left-2">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(image.similarity * 100)}% match
                    </Badge>
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate" title={image.name}>
                  {image.name}
                </p>
                {image.caption && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {image.caption}
                  </p>
                )}
                {image.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {image.tags.split(',').slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                    {image.tags.split(',').length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{image.tags.split(',').length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom Pagination */}
        {allImages.length > 0 && <Pagination position="bottom" />}

        {allImages.length === 0 && (
          <div className="text-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? "No images found matching your search." : "No images in this folder."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
} 