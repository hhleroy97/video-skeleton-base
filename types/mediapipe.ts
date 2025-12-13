/**
 * TypeScript types for MediaPipe integration
 */

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface PoseResults {
  poseLandmarks: PoseLandmark[];
  poseWorldLandmarks?: PoseLandmark[];
}

export interface HandResults {
  landmarks: HandLandmark[];
  handedness?: Array<{
    score: number;
    categoryName: string;
  }>;
}

export interface FaceResults {
  multiFaceLandmarks: FaceLandmark[][];
}

export interface MediaPipeResults {
  pose?: PoseResults;
  hands?: HandResults[];
  face?: FaceResults;
}

export type TrackingType = 'body' | 'hands' | 'face' | 'all';

export interface MediaPipeConfig {
  enableBody?: boolean;
  enableHands?: boolean;
  enableFace?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

