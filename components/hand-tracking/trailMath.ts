export function fillTrailSegments(params: {
  trailHistory: Float32Array; // particleCount * trailLength * 3 (newest at offset 0 for each particle)
  particleCount: number;
  trailLength: number;
  outSegments: Float32Array; // particleCount * (trailLength-1) * 2 * 3
}) {
  const { trailHistory, particleCount, trailLength, outSegments } = params;
  const segsPerParticle = Math.max(0, trailLength - 1);
  const expectedHistory = particleCount * trailLength * 3;
  const expectedOut = particleCount * segsPerParticle * 2 * 3;

  if (trailHistory.length !== expectedHistory) {
    throw new Error(`trailHistory length mismatch: got ${trailHistory.length}, expected ${expectedHistory}`);
  }
  if (outSegments.length !== expectedOut) {
    throw new Error(`outSegments length mismatch: got ${outSegments.length}, expected ${expectedOut}`);
  }

  // For each particle, connect point i -> i+1
  for (let p = 0; p < particleCount; p++) {
    const baseH = p * trailLength * 3;
    const baseS = p * segsPerParticle * 2 * 3;
    for (let i = 0; i < segsPerParticle; i++) {
      const a = baseH + i * 3;
      const b = baseH + (i + 1) * 3;
      const s = baseS + i * 2 * 3;

      outSegments[s] = trailHistory[a];
      outSegments[s + 1] = trailHistory[a + 1];
      outSegments[s + 2] = trailHistory[a + 2];

      outSegments[s + 3] = trailHistory[b];
      outSegments[s + 4] = trailHistory[b + 1];
      outSegments[s + 5] = trailHistory[b + 2];
    }
  }
}


