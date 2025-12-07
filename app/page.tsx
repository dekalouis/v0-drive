"use client"
import { UrlForm } from "@/components/url-form"
import { FolderList } from "@/components/folder-list"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function HomePage() {
  const router = useRouter()
  const [SignedIn, setSignedIn] = useState<any>(null)

  // Dynamically import Clerk components client-side
  useEffect(() => {
    const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    if (clerkKey && clerkKey !== 'pk_test_your_publishable_key_here' && clerkKey.startsWith('pk_')) {
      import("@clerk/nextjs").then((clerk) => {
        setSignedIn(() => clerk.SignedIn)
      }).catch(() => {
        // Clerk not available, continue without auth
      })
    }
  }, [])

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
