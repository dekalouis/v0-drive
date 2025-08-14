import { execSync } from "child_process"

async function setupDev() {
  console.log("🔧 Setting up development environment...")

  try {
    // Generate Prisma client
    console.log("📦 Generating Prisma client...")
    execSync("npx prisma generate", { stdio: "inherit" })

    // Push database schema
    console.log("🗄️  Pushing database schema...")
    execSync("npx prisma db push", { stdio: "inherit" })

    console.log("✅ Development environment setup complete!")
    console.log("\n📋 Next steps:")
    console.log("1. Add your environment variables to .env:")
    console.log("   - DATABASE_URL (PostgreSQL connection string)")
    console.log("   - REDIS_URL (Redis connection string)")
    console.log("   - GOOGLE_DRIVE_API_KEY (Google Drive API key)")
    console.log("   - GEMINI_API_KEY (Google AI API key)")
    console.log("\n2. Start the development server: npm run dev")
    console.log("3. Start the background workers: npm run workers")
  } catch (error) {
    console.error("❌ Setup failed:", error)
    process.exit(1)
  }
}

setupDev()
