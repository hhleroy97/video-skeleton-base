/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_VIDEO_POSE_MARKER_SETTINGS,
  loadVideoPoseMarkerSettings,
  saveVideoPoseMarkerSettings,
} from '@/lib/videoPoseSettingsStorage';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('videoPoseSettingsStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('loads defaults when storage is empty', () => {
    expect(loadVideoPoseMarkerSettings()).toEqual(DEFAULT_VIDEO_POSE_MARKER_SETTINGS);
  });

  it('saves and loads persisted settings', () => {
    saveVideoPoseMarkerSettings({
      bodyTrackingEnabled: false,
      showBodyCamPoints: false,
      realtimeBackgroundSegmentationEnabled: false,
      stepSensitivityPercent: 9,
      pointSizeScale: 2,
      boxHeightScale: 30,
      boxGrowthSeconds: 0.9,
      flowerBloomSeconds: 0.75,
      flowerDecaySeconds: 1.9,
      whimsyIntensity: 1.7,
      toonTextureMode: 'hatch',
      showStepPoints: false,
      stepMarkerStyle: 'flowers-3d',
    });

    const loaded = loadVideoPoseMarkerSettings();
    expect(loaded.bodyTrackingEnabled).toBe(false);
    expect(loaded.showBodyCamPoints).toBe(false);
    expect(loaded.realtimeBackgroundSegmentationEnabled).toBe(false);
    expect(loaded.stepSensitivityPercent).toBe(9);
    expect(loaded.pointSizeScale).toBe(2);
    expect(loaded.boxHeightScale).toBe(30);
    expect(loaded.boxGrowthSeconds).toBe(0.9);
    expect(loaded.flowerBloomSeconds).toBe(0.75);
    expect(loaded.flowerDecaySeconds).toBe(1.9);
    expect(loaded.whimsyIntensity).toBe(1.7);
    expect(loaded.toonTextureMode).toBe('hatch');
    expect(loaded.showStepPoints).toBe(false);
    expect(loaded.stepMarkerStyle).toBe('flowers-3d');
  });

  it('sanitizes out-of-range persisted values', () => {
    localStorage.setItem(
      'viz9:video-pose:marker-settings',
      JSON.stringify({
        bodyTrackingEnabled: true,
        showBodyCamPoints: false,
        realtimeBackgroundSegmentationEnabled: false,
        stepSensitivityPercent: 999,
        pointSizeScale: -5,
        boxHeightScale: 0,
        boxGrowthSeconds: 999,
        flowerBloomSeconds: 999,
        flowerDecaySeconds: -999,
        whimsyIntensity: 999,
        toonTextureMode: 'bad-value',
        showStepPoints: true,
        stepMarkerStyle: 'bad-value',
      })
    );

    const loaded = loadVideoPoseMarkerSettings();
    expect(loaded.bodyTrackingEnabled).toBe(true);
    expect(loaded.showBodyCamPoints).toBe(false);
    expect(loaded.realtimeBackgroundSegmentationEnabled).toBe(false);
    expect(loaded.stepSensitivityPercent).toBe(20);
    expect(loaded.pointSizeScale).toBe(0.5);
    expect(loaded.boxHeightScale).toBe(0.5);
    expect(loaded.boxGrowthSeconds).toBe(3);
    expect(loaded.flowerBloomSeconds).toBe(3);
    expect(loaded.flowerDecaySeconds).toBe(0.2);
    expect(loaded.whimsyIntensity).toBe(2);
    expect(loaded.toonTextureMode).toBe('stipple');
    expect(loaded.stepMarkerStyle).toBe('flowers');
  });
});
