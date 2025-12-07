"use client"
import { UrlForm } from "@/components/url-form"
import { FolderList } from "@/components/folder-list"
import { useRouter } from "next/navigation"

// Dynamically import Clerk components to avoid build-time errors
let SignedIn: any = null

// Only try to load Clerk if we're in the browser and key is available
if (typeof window !== 'undefined') {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (clerkKey && clerkKey !== 'pk_test_your_publishable_key_here') {
    try {
      const clerk = require("@clerk/nextjs")
      SignedIn = clerk.SignedIn
    } catch {
      // Clerk not available, continue without auth
    }
  }
}

export default function HomePage() {
  const router = useRouter()

  const handleSuccess = (folderId: string) => {
    router.push(`/folder/${folderId}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="max-w-2xl mx-auto space-y-8 py-8">
        <UrlForm onSuccess={handleSuccess} />
        
        {SignedIn ? (
          <SignedIn>
            <FolderList />
          </SignedIn>
        ) : (
          <FolderList />
        )}
      </div>
    </div>
  )
}
