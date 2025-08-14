import { cleanupJobs, getQueueStats } from "../lib/queue"

async function main() {
  console.log("Cleaning up old jobs...")

  const statsBefore = await getQueueStats()
  console.log("Stats before cleanup:", statsBefore)

  await cleanupJobs()

  const statsAfter = await getQueueStats()
  console.log("Stats after cleanup:", statsAfter)

  console.log("Cleanup completed!")
  process.exit(0)
}

main().catch((error) => {
  console.error("Cleanup failed:", error)
  process.exit(1)
})
