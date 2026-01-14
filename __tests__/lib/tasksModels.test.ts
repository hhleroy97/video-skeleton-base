import {
  HAND_LANDMARKER_MODEL_URL,
  POSE_LANDMARKER_LITE_MODEL_URL,
  TASKS_VISION_WASM_BASE_URL,
} from '@/lib/mediapipe/tasksModels';

describe('MediaPipe Tasks model URLs', () => {
  it('uses stable https URLs', () => {
    expect(TASKS_VISION_WASM_BASE_URL).toMatch(/^https:\/\//);
    expect(POSE_LANDMARKER_LITE_MODEL_URL).toMatch(/^https:\/\//);
    expect(HAND_LANDMARKER_MODEL_URL).toMatch(/^https:\/\//);
  });

  it('points at known MediaPipe model buckets', () => {
    expect(POSE_LANDMARKER_LITE_MODEL_URL).toContain('mediapipe-models/pose_landmarker/');
    expect(HAND_LANDMARKER_MODEL_URL).toContain('mediapipe-models/hand_landmarker/');
  });
});


