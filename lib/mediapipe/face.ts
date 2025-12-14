/**
 * MediaPipe Face Mesh detection setup
 */
import type { FaceResults } from '@/types/mediapipe';

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

// Lazy load FaceMesh class - load from CDN
let FaceMeshClass: any = null;
let faceMeshLoadPromise: Promise<any> | null = null;

const getFaceMesh = async (): Promise<any> => {
  // Ensure we're in the browser
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  
  // Return cached class if available
  if (FaceMeshClass) {
    return FaceMeshClass;
  }
  
  // Load from CDN if not already loading
  if (!faceMeshLoadPromise) {
    try {
      faceMeshLoadPromise = (async () => {
        await loadMediaPipeScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
        
        if ((window as any).FaceMesh) {
          FaceMeshClass = (window as any).FaceMesh;
          return FaceMeshClass;
        }
        
        try {
          const module = await import('@mediapipe/face_mesh');
          FaceMeshClass = module.FaceMesh || (module as any).default?.FaceMesh || (module as any).default;
          if (FaceMeshClass) return FaceMeshClass;
        } catch (importError) {
          console.warn('Import fallback failed:', importError);
        }
        
        console.error('FaceMesh not found on window object or in module');
        return null;
      })();
    } catch (error) {
      console.error('Error loading MediaPipe FaceMesh:', error);
      faceMeshLoadPromise = null;
      return null;
    }
  }
  
  return faceMeshLoadPromise;
};

// Face mesh connections - simplified visualization
// MediaPipe face mesh has 468 landmarks
// We'll draw all landmarks as points for now (connections can be added later)
export const FACE_CONNECTIONS: Array<[number, number]> = [];

export interface FaceDetectorConfig {
  maxNumFaces?: number;
  refineLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

/**
 * Initialize MediaPipe Face Mesh detector
 */
export async function createFaceDetector(config: FaceDetectorConfig = {}) {
  const FaceMesh = await getFaceMesh();
  if (!FaceMesh) {
    throw new Error('FaceMesh is not available. This function must be called in the browser.');
  }
  
  const faceMesh = new FaceMesh({
    locateFile: (file: string) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    },
  });

  faceMesh.setOptions({
    maxNumFaces: config.maxNumFaces ?? 1,
    refineLandmarks: config.refineLandmarks ?? false,
    minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
    minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
  });

  return faceMesh;
}

/**
 * Process face results and return normalized format
 */
export function processFaceResults(results: any): FaceResults | null {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    return null;
  }

  return {
    multiFaceLandmarks: results.multiFaceLandmarks.map((landmarks: any[]) =>
      landmarks.map((landmark: any) => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z ?? 0,
      }))
    ),
  };
}

