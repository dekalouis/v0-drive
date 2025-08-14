import { folderQueue } from "../lib/queue"

async function testWorker() {
  console.log("🧪 Testing worker functionality...")
  
  try {
    // Add a simple test job
    const testJob = await folderQueue.add("test", { 
      folderId: "test", 
      googleFolderId: "test" 
    }, {
      jobId: "test-worker-job",
      removeOnComplete: true,
      removeOnFail: true
    })
    
    console.log(`✅ Test job added: ${testJob.id}`)
    
    // Wait a bit and check if it was processed
    setTimeout(async () => {
      const job = await folderQueue.getJob(testJob.id || "")
      if (job) {
        const state = await job.getState()
        console.log(`📊 Test job state: ${state}`)
        
        if (state === "completed") {
          console.log("✅ Workers are working correctly!")
        } else if (state === "failed") {
          console.log("❌ Test job failed")
          const failedReason = job.failedReason || "Unknown error"
          console.log(`   Reason: ${failedReason}`)
        } else {
          console.log(`⚠️ Test job is in state: ${state}`)
        }
      } else {
        console.log("❌ Test job not found - workers may not be running")
      }
      
      process.exit(0)
    }, 5000)
    
  } catch (error) {
    console.error("❌ Error testing worker:", error)
    process.exit(1)
  }
}

testWorker() 