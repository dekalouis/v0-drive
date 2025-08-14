"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Search, Image as ImageIcon, Loader2 } from "lucide-react"

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

  useEffect(() => {
    fetchFolderData()
    const interval = setInterval(fetchFolderData, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [folderId])

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500"
      case "processing": return "bg-yellow-500"
      case "failed": return "bg-red-500"
      default: return "bg-gray-500"
    }
  }

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

  const displayImages = searchQuery ? searchResults : folder.images
  const progressPercentage = folder.totalImages > 0 ? (folder.processedImages / folder.totalImages) * 100 : 0

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
                <div className="text-sm text-muted-foreground">
                  {folder.processedImages} / {folder.totalImages} images
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

        {/* Images Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {displayImages.map((image) => (
            <Card key={image.id} className="overflow-hidden">
              <div className="aspect-square relative">
                {image.fileId ? (
                  <img
                    src={`/api/image-proxy?fileId=${image.fileId}`}
                    alt={image.name}
                    className="w-full h-full object-cover"
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
                    className="w-full h-full object-cover"
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
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="text-xs">
                    {image.status}
                  </Badge>
                </div>
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

        {displayImages.length === 0 && (
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