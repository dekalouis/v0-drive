"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FolderSearch, Home, LayoutDashboard } from "lucide-react"

// Dynamically import Clerk components to avoid build-time errors
let ClerkComponents: {
  SignInButton: any
  SignUpButton: any
  SignedIn: any
  SignedOut: any
  UserButton: any
} | null = null

// Only try to load Clerk if we're in the browser and key is available
if (typeof window !== 'undefined') {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (clerkKey && clerkKey !== 'pk_test_your_publishable_key_here') {
    try {
      ClerkComponents = require("@clerk/nextjs")
    } catch {
      // Clerk not available, continue without auth
    }
  }
}

export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const isFolder = pathname.startsWith("/folder/")
  const hasClerk = ClerkComponents !== null

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
          {hasClerk && ClerkComponents && (
            <ClerkComponents.SignedIn>
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
            </ClerkComponents.SignedIn>
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
        {hasClerk && ClerkComponents && (
          <div className="flex items-center gap-2">
            <ClerkComponents.SignedOut>
              <ClerkComponents.SignInButton mode="modal">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </ClerkComponents.SignInButton>
              <ClerkComponents.SignUpButton mode="modal">
                <Button size="sm">
                  Sign Up
                </Button>
              </ClerkComponents.SignUpButton>
            </ClerkComponents.SignedOut>
            <ClerkComponents.SignedIn>
              <ClerkComponents.UserButton 
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8"
                  }
                }}
              />
            </ClerkComponents.SignedIn>
          </div>
        )}
      </div>
    </header>
  )
}

