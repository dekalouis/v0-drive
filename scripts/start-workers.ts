import { folderWorker, imageWorker } from "../lib/workers"

console.log("Starting BullMQ workers...")
console.log("- Folder worker: processing folders and queuing image jobs")
console.log("- Image worker: processing individual images with AI captioning")
console.log("Press Ctrl+C to stop workers")

// Keep the process alive
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...")
  process.exit(0)
})

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...")
  process.exit(0)
})

// Log worker status
setInterval(() => {
  console.log(`Workers running - Folder: ${folderWorker.isRunning()}, Image: ${imageWorker.isRunning()}`)
}, 30000) // Log every 30 seconds
