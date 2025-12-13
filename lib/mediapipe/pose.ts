/**
 * MediaPipe Pose detection setup
 */
import type { PoseResults } from '@/types/mediapipe';

// Lazy load Pose class - using dynamic import
let PoseClass: any = null;
let poseLoadPromise: Promise<any> | null = null;

const getPose = async (): Promise<any> => {
  // Ensure we're in the browser
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  
  // Return cached class if available
  if (PoseClass) {
    return PoseClass;
  }
  
  // Load module if not already loading
  if (!poseLoadPromise) {
    poseLoadPromise = import('@mediapipe/pose')
      .then((module) => {
        // Try named export first
        if (module.Pose && typeof module.Pose === 'function') {
          PoseClass = module.Pose;
          return PoseClass;
        }
        
        // Try default export
        const defaultExport = (module as any).default;
        if (defaultExport) {
          if (defaultExport.Pose && typeof defaultExport.Pose === 'function') {
            PoseClass = defaultExport.Pose;
            return PoseClass;
          }
          if (typeof defaultExport === 'function') {
            PoseClass = defaultExport;
            return PoseClass;
          }
        }
        
        console.error('Pose not found in module. Keys:', Object.keys(module));
        return null;
      })
      .catch((error) => {
        console.error('Failed to import @mediapipe/pose:', error);
        poseLoadPromise = null;
        return null;
      });
  }
  
  return poseLoadPromise;
};

// Pose connections based on MediaPipe pose landmarks (33 points)
// Format: [from_index, to_index]
export const POSE_CONNECTIONS_LIST: Array<[number, number]> = [
  // Face
  [0, 1], [0, 4], [1, 2], [2, 3], [3, 7], [4, 5], [5, 6], [6, 8],
  // Upper body
  [9, 10], // Shoulders
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Torso
  [11, 23], [12, 24], [23, 24],
  // Lower body
  [23, 25], [24, 26], [25, 27], [27, 29], [27, 31], [29, 31],
  [26, 28], [28, 30], [28, 32], [30, 32],
];

export interface PoseDetectorConfig {
  modelComplexity?: 0 | 1 | 2;
  smoothLandmarks?: boolean;
  enableSegmentation?: boolean;
  smoothSegmentation?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

/**
 * Initialize MediaPipe Pose detector
 */
export async function createPoseDetector(config: PoseDetectorConfig = {}) {
  // Double-check we're in browser
  if (typeof window === 'undefined') {
    throw new Error('createPoseDetector must be called in the browser (window is undefined)');
  }
  
  const Pose = await getPose();
  if (!Pose) {
    console.error('getPose returned null. Window available:', typeof window !== 'undefined');
    throw new Error('Pose is not available. This function must be called in the browser.');
  }
  
  // Verify Pose is a constructor
  if (typeof Pose !== 'function') {
    console.error('Pose is not a function! Type:', typeof Pose, 'Value:', Pose);
    throw new Error(`Pose is not a constructor. Got type: ${typeof Pose}`);
  }
  
  console.log('Creating new Pose instance...');
  const pose = new Pose({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    },
  });

  pose.setOptions({
    modelComplexity: config.modelComplexity ?? 1,
    smoothLandmarks: config.smoothLandmarks ?? true,
    enableSegmentation: config.enableSegmentation ?? false,
    smoothSegmentation: config.smoothSegmentation ?? false,
    minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
    minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
  });

  return pose;
}

/**
 * Process pose results and return normalized format
 */
export function processPoseResults(results: any): PoseResults | null {
  if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
    return null;
  }

  return {
    poseLandmarks: results.poseLandmarks.map((landmark: any) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z ?? 0,
      visibility: landmark.visibility,
    })),
    poseWorldLandmarks: results.poseWorldLandmarks?.map((landmark: any) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z ?? 0,
      visibility: landmark.visibility,
    })),
  };
}

