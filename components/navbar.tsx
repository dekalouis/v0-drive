"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { FolderSearch, Home, LayoutDashboard } from "lucide-react"

export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const isFolder = pathname.startsWith("/folder/")

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
          <SignedIn>
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
          </SignedIn>
          
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
        <div className="flex items-center gap-2">
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">
                Sign Up
              </Button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton 
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8"
                }
              }}
            />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}

