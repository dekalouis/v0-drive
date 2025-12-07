"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FolderSearch, Home, LayoutDashboard } from "lucide-react"
import { useEffect, useState } from "react"

export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const isFolder = pathname.startsWith("/folder/")
  const [clerkComponents, setClerkComponents] = useState<{
    SignInButton: any
    SignUpButton: any
    SignedIn: any
    SignedOut: any
    UserButton: any
  } | null>(null)

  // Check if Clerk is available client-side (matching layout validation)
  useEffect(() => {
    const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    const hasValidClerkKey = clerkKey && 
      clerkKey !== 'pk_test_your_publishable_key_here' &&
      clerkKey.startsWith('pk_')
    
    if (hasValidClerkKey) {
      try {
        // Dynamically import Clerk components
        import("@clerk/nextjs").then((clerk) => {
          setClerkComponents({
            SignInButton: clerk.SignInButton,
            SignUpButton: clerk.SignUpButton,
            SignedIn: clerk.SignedIn,
            SignedOut: clerk.SignedOut,
            UserButton: clerk.UserButton,
          })
        }).catch(() => {
          // Clerk not available, continue without auth
        })
      } catch {
        // Clerk not available, continue without auth
      }
    }
  }, [])

  const hasClerk = clerkComponents !== null

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto flex h-14 items-center px-4">
        {/* Logo / Brand */}
        <Link href="/" className="flex items-center gap-2 mr-6">
          <FolderSearch className="h-6 w-6 text-primary" />
          <span className="font-semibold hidden sm:inline-block">DriveImage</span>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 flex-1">
          {hasClerk && clerkComponents && (
            <clerkComponents.SignedIn>
              <Link href="/">
                <Button
                  variant={isHome ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              </Link>
            </clerkComponents.SignedIn>
          )}
          
          {isFolder && (
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">New Search</span>
              </Button>
            </Link>
          )}
        </nav>

        {/* Auth Section */}
        {hasClerk && clerkComponents && (
          <div className="flex items-center gap-2">
            <clerkComponents.SignedOut>
              <clerkComponents.SignInButton mode="modal">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </clerkComponents.SignInButton>
              <clerkComponents.SignUpButton mode="modal">
                <Button size="sm">
                  Sign Up
                </Button>
              </clerkComponents.SignUpButton>
            </clerkComponents.SignedOut>
            <clerkComponents.SignedIn>
              <clerkComponents.UserButton 
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8"
                  }
                }}
              />
            </clerkComponents.SignedIn>
          </div>
        )}
      </div>
    </header>
  )
}

