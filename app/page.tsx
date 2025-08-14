"use client"
import { UrlForm } from "@/components/url-form"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()

  const handleSuccess = (folderId: string) => {
    router.push(`/folder/${folderId}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center p-4">
      <UrlForm onSuccess={handleSuccess} />
    </div>
  )
}
