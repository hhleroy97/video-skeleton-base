/**
 * MediaPipe Hands detection setup
 */
import type { HandResults } from '@/types/mediapipe';

// Load MediaPipe from CDN script tags
const loadMediaPipeScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

// Lazy load Hands class - load from CDN
let HandsClass: any = null;
let handsLoadPromise: Promise<any> | null = null;

const getHands = async (): Promise<any> => {
  // Ensure we're in the browser
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  
  // Return cached class if available
  if (HandsClass) {
    return HandsClass;
  }
  
  // Load from CDN if not already loading
  if (!handsLoadPromise) {
    try {
      handsLoadPromise = (async () => {
        await loadMediaPipeScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        
        if ((window as any).Hands) {
          HandsClass = (window as any).Hands;
          return HandsClass;
        }
        
        try {
          const module = await import('@mediapipe/hands');
          HandsClass = module.Hands || (module as any).default?.Hands || (module as any).default;
          if (HandsClass) return HandsClass;
        } catch (importError) {
          console.warn('Import fallback failed:', importError);
        }
        
        console.error('Hands not found on window object or in module');
        return null;
      })();
    } catch (error) {
      console.error('Error loading MediaPipe Hands:', error);
      handsLoadPromise = null;
      return null;
    }
  }
  
  return handsLoadPromise;
};

// Hand connections based on MediaPipe hand landmarks (21 points)
// Format: [from_index, to_index]
export const HAND_CONNECTIONS_LIST: Array<[number, number]> = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
];

export interface HandsDetectorConfig {
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

/**
 * Initialize MediaPipe Hands detector
 */
export async function createHandsDetector(config: HandsDetectorConfig = {}) {
  const Hands = await getHands();
  if (!Hands) {
    throw new Error('Hands is not available. This function must be called in the browser.');
  }
  
  const hands = new Hands({
    locateFile: (file: string) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: config.maxNumHands ?? 2,
    modelComplexity: config.modelComplexity ?? 1,
    minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
    minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
  });

  return hands;
}

/**
 * Process hands results and return normalized format
 */
export function processHandsResults(results: any): HandResults[] {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    return [];
  }

  return results.multiHandLandmarks.map((landmarks: any[], index: number) => ({
    landmarks: landmarks.map((landmark: any) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z ?? 0,
    })),
    handedness: results.multiHandedness?.[index] ? [
      {
        score: results.multiHandedness[index].score ?? 0,
        categoryName: results.multiHandedness[index].categoryName ?? 'Unknown',
      }
    ] : undefined,
  }));
}

