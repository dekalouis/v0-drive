"use client"
import { UrlForm } from "@/components/url-form"
import { FolderList } from "@/components/folder-list"
import { useRouter } from "next/navigation"
import { SignedIn } from "@clerk/nextjs"

export default function HomePage() {
  const router = useRouter()

  const handleSuccess = (folderId: string) => {
    router.push(`/folder/${folderId}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="max-w-2xl mx-auto space-y-8 py-8">
        <UrlForm onSuccess={handleSuccess} />
        
        <SignedIn>
          <FolderList />
        </SignedIn>
      </div>
    </div>
  )
}
