/**
 * Centralized URLs for MediaPipe Tasks Vision assets (WASM + model .task files).
 *
 * Keeping these in one place makes it easier to pin versions and test for accidental changes.
 */

export const TASKS_VISION_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';

// Pose Landmarker (lite) model
export const POSE_LANDMARKER_LITE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Hand Landmarker model
export const HAND_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';




