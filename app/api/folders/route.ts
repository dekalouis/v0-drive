import { type NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find user by Clerk ID
    let user = await prisma.user.findUnique({
      where: { clerkId },
      include: {
        folders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            folderId: true,
            name: true,
            folderUrl: true,
            status: true,
            totalImages: true,
            processedImages: true,
            createdAt: true,
          },
        },
      },
    })

    if (!user) {
      // User hasn't created any folders yet
      return NextResponse.json({ folders: [] })
    }

    // Sync email from Clerk if missing
    if (!user.email) {
      const clerkUser = await currentUser()
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress || null
      if (email) {
        await prisma.user.update({
          where: { id: user.id },
          data: { email },
        })
      }
    }

    return NextResponse.json({ folders: user.folders })
  } catch (error) {
    console.error("❌ Folders API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
