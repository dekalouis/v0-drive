"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Image as ImageIcon, Loader2, RefreshCw, ExternalLink } from "lucide-react"
import Image from 'next/image'

interface ImageCardProps {
  image: {
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
  onRetry: (imageId: string) => void
  retryingImages: Set<string>
}

export function ImageCard({ image, onRetry, retryingImages }: ImageCardProps) {
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  const handleCardClick = () => {
    if (image.webViewLink) {
      window.open(image.webViewLink, '_blank')
    }
  }

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    onRetry(image.id)
  }

  // Clean caption - remove JSON formatting if present
  const cleanCaption = (caption?: string) => {
    if (!caption) return null
    
    // Handle HTML-encoded JSON strings
    let cleanedCaption = caption
    
    // Decode HTML entities first
    if (caption.includes('&quot;')) {
      cleanedCaption = caption.replace(/&quot;/g, '"')
    }
    
    // Remove markdown code blocks if present
    if (cleanedCaption.startsWith('```json') && cleanedCaption.endsWith('```')) {
      cleanedCaption = cleanedCaption.replace(/^```json\n/, '').replace(/\n```$/, '')
    }
    
    // If caption contains JSON structure, extract just the caption text
    if (cleanedCaption.includes('"caption"')) {
      try {
        const parsed = JSON.parse(cleanedCaption)
        return parsed.caption || caption
      } catch {
        // If parsing fails, return as is
        return caption
      }
    }
    
    return caption
  }

  const displayCaption = cleanCaption(image.caption)

  return (
    <Card 
      className={`overflow-hidden transition-all duration-200 cursor-pointer group ${
        image.status === "failed" ? "opacity-60" : ""
      } ${
        isHovered ? "scale-105 shadow-lg" : "hover:scale-102 hover:shadow-md"
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      <div className="aspect-square relative">
        {!imageError && image.fileId ? (
          <Image
            src={`/api/image-proxy?fileId=${image.fileId}`}
            alt={image.name}
            width={200}
            height={200}
            className={`w-full h-full object-cover transition-all duration-200 ${
              image.status === "failed" ? "grayscale blur-sm" : ""
            } ${isHovered ? "brightness-110" : ""}`}
            onError={handleImageError}
          />
        ) : !imageError && image.thumbnailLink ? (
          <Image
            src={`/api/image-proxy?url=${encodeURIComponent(image.thumbnailLink)}`}
            alt={image.name}
            width={200}
            height={200}
            className={`w-full h-full object-cover transition-all duration-200 ${
              image.status === "failed" ? "grayscale blur-sm" : ""
            } ${isHovered ? "brightness-110" : ""}`}
            onError={handleImageError}
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        
        {/* Status badge */}
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="secondary" className="text-xs">
            {image.status}
          </Badge>
        </div>
        
        {/* Hover overlay with external link icon */}
        {isHovered && image.webViewLink && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-20">
            <div className="bg-white/90 rounded-full p-2">
              <ExternalLink className="h-5 w-5 text-black" />
            </div>
          </div>
        )}
        
        {/* Retry button for failed images */}
        {image.status === "failed" && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-30">
            <Button
              onClick={handleRetryClick}
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
        
        {/* Similarity score badge */}
        {image.similarity && (
          <div className="absolute bottom-2 left-2 z-10">
            <Badge variant="outline" className="text-xs bg-white/90">
              {Math.round(image.similarity * 100)}% match
            </Badge>
          </div>
        )}
      </div>
      
      <CardContent className="p-3">
        <p className="text-sm font-medium truncate" title={image.name}>
          {image.name}
        </p>
        
        {displayCaption && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={displayCaption}>
            {displayCaption}
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
  )
} 