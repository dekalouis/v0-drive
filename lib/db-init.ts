import { prisma } from "@/lib/prisma"

let pgvectorReady: Promise<void> | null = null
let captionVecIndexReady: Promise<void> | null = null

/**
 * Ensures the pgvector extension is available. We memoize the promise so the
 * extension check only runs once per process even if multiple callers request it.
 */
export function ensurePgvectorExtension() {
  if (!pgvectorReady) {
    pgvectorReady = prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`)
      .then(() => {
        console.log("✅ pgvector extension ready")
      })
      .catch((error) => {
        console.error("❌ Failed to enable pgvector extension:", error)
        throw error
      })
  }

  return pgvectorReady
}

/**
 * Ensures the caption vector index exists before we start writing embeddings.
 */
export async function ensureCaptionVectorIndex() {
  await ensurePgvectorExtension()

  if (!captionVecIndexReady) {
    captionVecIndexReady = prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS images_caption_vec_idx 
      ON "images" USING hnsw ("captionVec" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `)
      .then(() => {
        console.log("✅ images_caption_vec_idx ready")
      })
      .catch((error) => {
        console.error("❌ Failed to ensure caption vector index:", error)
        throw error
      })
  }

  return captionVecIndexReady
}
