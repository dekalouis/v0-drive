import { NextResponse } from "next/server"
import { getProcessingStats } from "@/lib/workers"

export async function GET() {
  try {
    const stats = await getProcessingStats()
    
    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Failed to get processing stats:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to get processing statistics",
        timestamp: new Date().toISOString(),
      }, 
      { status: 500 }
    )
  }
} 