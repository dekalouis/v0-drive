"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FolderOpen, Image as ImageIcon, Loader2, Clock } from "lucide-react"

interface Folder {
  id: string
  folderId: string
  name: string | null
  folderUrl: string
  status: string
  totalImages: number
  processedImages: number
  createdAt: string
}

export function FolderList() {
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const response = await fetch("/api/folders")
        if (response.ok) {
          const data = await response.json()
          setFolders(data.folders)
        } else if (response.status === 401) {
          // User not authenticated, don't show error
          setFolders([])
        } else {
          setError("Failed to load folders")
        }
      } catch (err) {
        console.error("Error fetching folders:", err)
        setError("Failed to load folders")
      } finally {
        setLoading(false)
      }
    }

    fetchFolders()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500"
      case "processing":
        return "bg-yellow-500"
      case "failed":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Your Folders
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Your Folders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (folders.length === 0) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Your Folders
          </CardTitle>
          <CardDescription>
            Your uploaded folders will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No folders yet. Upload your first Google Drive folder above!
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Your Folders
        </CardTitle>
        <CardDescription>
          Click on a folder to view and search its images
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {folders.map((folder) => (
          <div
            key={folder.id}
            onClick={() => router.push(`/folder/${folder.id}`)}
            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FolderOpen className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm">
                  {folder.name || folder.folderId}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {folder.processedImages}/{folder.totalImages} images
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(folder.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <Badge className={`${getStatusColor(folder.status)} flex-shrink-0 ml-2`}>
              {folder.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

