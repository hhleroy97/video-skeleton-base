export interface BorderSample {
  x: number;
  y: number;
  value: number;
}

export interface MotionVector {
  dx: number;
  dy: number;
}

export function rgbaToGrayscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const gray = new Uint8Array(width * height);
  let j = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const r = rgba[j];
    const g = rgba[j + 1];
    const b = rgba[j + 2];
    // Integer-friendly luma approximation.
    gray[i] = (77 * r + 150 * g + 29 * b) >> 8;
    j += 4;
  }
  return gray;
}

export function sampleBorderPoints(
  gray: Uint8Array,
  width: number,
  height: number,
  step: number = 8,
  band: number = 20
): BorderSample[] {
  const samples: BorderSample[] = [];
  const clampBand = Math.max(4, Math.min(Math.floor(Math.min(width, height) / 4), band));
  const maxX = width - 1;
  const maxY = height - 1;

  const push = (x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(maxX, x));
    const clampedY = Math.max(0, Math.min(maxY, y));
    samples.push({
      x: clampedX,
      y: clampedY,
      value: gray[clampedY * width + clampedX],
    });
  };

  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < clampBand; y += step) push(x, y);
    for (let y = height - clampBand; y < height; y += step) push(x, y);
  }

  for (let y = clampBand; y < height - clampBand; y += step) {
    for (let x = 0; x < clampBand; x += step) push(x, y);
    for (let x = width - clampBand; x < width; x += step) push(x, y);
  }

  return samples;
}

export function estimateBorderTranslation(
  previousSamples: BorderSample[],
  currentGray: Uint8Array,
  width: number,
  height: number,
  maxShift: number = 8
): MotionVector {
  if (previousSamples.length === 0) return { dx: 0, dy: 0 };

  let bestError = Number.POSITIVE_INFINITY;
  let bestDx = 0;
  let bestDy = 0;

  for (let dy = -maxShift; dy <= maxShift; dy += 1) {
    for (let dx = -maxShift; dx <= maxShift; dx += 1) {
      let error = 0;
      let count = 0;
      for (const sample of previousSamples) {
        const x = sample.x + dx;
        const y = sample.y + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const value = currentGray[y * width + x];
        error += Math.abs(sample.value - value);
        count += 1;
      }

      if (count < 50) continue;
      const normalizedError = error / count;
      if (normalizedError < bestError) {
        bestError = normalizedError;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return { dx: bestDx, dy: bestDy };
}

