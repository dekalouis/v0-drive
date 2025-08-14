export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length")
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function findMostSimilar(
  queryVector: number[],
  candidates: Array<{ id: string; vector: number[]; [key: string]: any }>,
  topK = 10,
): Array<{ id: string; similarity: number; [key: string]: any }> {
  const similarities = candidates
    .map((candidate) => ({
      ...candidate,
      similarity: cosineSimilarity(queryVector, candidate.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  return similarities
}

export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  return norm === 0 ? vector : vector.map((val) => val / norm)
}
