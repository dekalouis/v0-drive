"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, FolderOpen } from "lucide-react"

interface UrlFormProps {
  onSuccess: (folderId: string) => void
}

export function UrlForm({ onSuccess }: UrlFormProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderUrl: url.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process folder")
      }

      onSuccess(data.folderId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <FolderOpen className="h-12 w-12 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">Google Drive Image Searcher</CardTitle>
        <CardDescription>
          Paste a public Google Drive folder link to search through images using AI-powered captions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Make sure the folder is shared with "Anyone with the link" (viewer access)
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || !url.trim()} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Folder...
              </>
            ) : (
              "Analyze Images"
            )}
          </Button>
        </form>

        <div className="mt-6 text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Supported formats:</strong> JPG, PNG, GIF, WebP, BMP
          </p>
          <p>
            <strong>How it works:</strong> We&apos;ll analyze each image with AI to create searchable captions
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
