import {
  estimateBorderTranslation,
  rgbaToGrayscale,
  sampleBorderPoints,
} from '@/lib/cameraMotion';

function makeGray(width: number, height: number, fn: (x: number, y: number) => number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      gray[y * width + x] = fn(x, y);
    }
  }
  return gray;
}

describe('cameraMotion helpers', () => {
  it('converts rgba to grayscale', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const gray = rgbaToGrayscale(rgba, 2, 1);
    expect(gray).toHaveLength(2);
    expect(gray[0]).toBeGreaterThan(0);
    expect(gray[1]).toBeGreaterThan(0);
  });

  it('samples border points', () => {
    const gray = makeGray(40, 30, (x, y) => (x + y) % 255);
    const samples = sampleBorderPoints(gray, 40, 30, 5, 10);
    expect(samples.length).toBeGreaterThan(20);
  });

  it('estimates simple border translation', () => {
    const width = 80;
    const height = 60;
    const source = makeGray(width, height, (x, y) => ((x * 3 + y * 5) % 251));
    const dx = 3;
    const dy = -2;
    const shifted = makeGray(width, height, (x, y) => {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) return 0;
      return source[sy * width + sx];
    });

    const samples = sampleBorderPoints(source, width, height, 6, 16);
    const estimated = estimateBorderTranslation(samples, shifted, width, height, 6);

    expect(estimated.dx).toBe(dx);
    expect(estimated.dy).toBe(dy);
  });
});

