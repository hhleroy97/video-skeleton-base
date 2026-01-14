import {
  DEFAULT_MIDAS_TOUCH_CONTROLS,
  detectMaterialStepAction,
  isMovementHandActive,
  MIDAS_TOUCH_MATERIAL_PRESETS,
  type MidasTouchControls,
} from '@/components/hand-tracking/MidasTouchVisual';

describe('MidasTouchVisual', () => {
  describe('DEFAULT_MIDAS_TOUCH_CONTROLS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.baseRoughness).toBe(0.95);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.transformSpeed).toBe(2.5);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.particleCount).toBe(250);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.particleSize).toBe(0.018);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.glowIntensity).toBe(0.8);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.autoRotateSpeed).toBe(0.15);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.geometryType).toBe('torusKnot');
    });

    it('has all required control properties', () => {
      const controls: MidasTouchControls = DEFAULT_MIDAS_TOUCH_CONTROLS;
      
      expect(controls).toHaveProperty('baseRoughness');
      expect(controls).toHaveProperty('transformSpeed');
      expect(controls).toHaveProperty('particleCount');
      expect(controls).toHaveProperty('particleSize');
      expect(controls).toHaveProperty('glowIntensity');
      expect(controls).toHaveProperty('autoRotateSpeed');
      expect(controls).toHaveProperty('geometryType');
    });

    it('baseRoughness is within valid range (0-1)', () => {
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.baseRoughness).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.baseRoughness).toBeLessThanOrEqual(1);
    });

    it('glowIntensity is within valid range (0-1)', () => {
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.glowIntensity).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.glowIntensity).toBeLessThanOrEqual(1);
    });

    it('particleCount is a positive integer', () => {
      expect(DEFAULT_MIDAS_TOUCH_CONTROLS.particleCount).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_MIDAS_TOUCH_CONTROLS.particleCount)).toBe(true);
    });

    it('geometryType is a valid option', () => {
      const validTypes = ['torusKnot', 'icosahedron', 'sphere', 'dodecahedron'];
      expect(validTypes).toContain(DEFAULT_MIDAS_TOUCH_CONTROLS.geometryType);
    });
  });

  describe('MIDAS_TOUCH_MATERIAL_PRESETS (palette A)', () => {
    it('has 4 presets (1-4 fingers)', () => {
      expect(MIDAS_TOUCH_MATERIAL_PRESETS).toHaveLength(4);
    });

    it('includes distinct looks: ceramic, brushed metal, frosted glass, neon', () => {
      const names = MIDAS_TOUCH_MATERIAL_PRESETS.map((m) => m.name);
      expect(names).toEqual([
        'Ceramic Porcelain',
        'Brushed Metal',
        'Frosted Glass',
        'Neon Emissive',
      ]);
    });

    it('frosted glass uses transmission and neon uses emissive', () => {
      const frosted = MIDAS_TOUCH_MATERIAL_PRESETS[2];
      expect(frosted.transmission).toBeGreaterThan(0.5);
      expect(frosted.roughness).toBeGreaterThan(0.4);

      const neon = MIDAS_TOUCH_MATERIAL_PRESETS[3];
      expect(neon.emissiveIntensity).toBeGreaterThan(0);
      expect(neon.emissive).toBeDefined();
    });
  });

  describe('detectMaterialStepAction', () => {
    const makeLandmarks = (overrides: Partial<Record<number, { x: number; y: number; z: number }>> = {}) =>
      new Array(21).fill(0).map((_, i) => overrides[i] ?? { x: 0, y: 0, z: 0 });

    it('returns null when landmarks are invalid', () => {
      expect(detectMaterialStepAction([] as any).action).toBe(null);
    });

    it('detects prev on thumb+index pinch', () => {
      const lm = makeLandmarks({
        4: { x: 0, y: 0, z: 0 },      // thumb tip
        8: { x: 0.01, y: 0, z: 0 },   // index tip close
        12: { x: 0.2, y: 0, z: 0 },   // middle tip far
      });
      expect(detectMaterialStepAction(lm, 0.05).action).toBe('prev');
    });

    it('detects next on thumb+middle pinch', () => {
      const lm = makeLandmarks({
        4: { x: 0, y: 0, z: 0 },
        8: { x: 0.2, y: 0, z: 0 },
        12: { x: 0.01, y: 0, z: 0 },
      });
      expect(detectMaterialStepAction(lm, 0.05).action).toBe('next');
    });

    it('can use a larger middle pinch threshold', () => {
      const lm = makeLandmarks({
        4: { x: 0, y: 0, z: 0 },
        8: { x: 0.2, y: 0, z: 0 },    // far
        12: { x: 0.07, y: 0, z: 0 },  // 0.07 away
      });
      expect(
        detectMaterialStepAction(lm, { indexThreshold: 0.05, middleThreshold: 0.075 }).action
      ).toBe('next');
    });

    it('chooses the closer pinch if both are under threshold', () => {
      const lm = makeLandmarks({
        4: { x: 0, y: 0, z: 0 },
        8: { x: 0.02, y: 0, z: 0 },  // 0.02
        12: { x: 0.01, y: 0, z: 0 }, // 0.01 -> closer, so next
      });
      expect(detectMaterialStepAction(lm, 0.05).action).toBe('next');
    });
  });

  describe('isMovementHandActive', () => {
    it('returns false for null', () => {
      expect(isMovementHandActive(null)).toBe(false);
    });

    it('returns false for partial landmark sets', () => {
      const hand = {
        handedness: 'Right',
        landmarks: new Array(20).fill(0).map(() => ({ x: 0, y: 0, z: 0 })),
      } as any;
      expect(isMovementHandActive(hand)).toBe(false);
    });

    it('returns true for a full landmark set (21+)', () => {
      const hand = {
        handedness: 'Right',
        landmarks: new Array(21).fill(0).map(() => ({ x: 0, y: 0, z: 0 })),
      } as any;
      expect(isMovementHandActive(hand)).toBe(true);
    });
  });

  describe('MidasTouchControls type', () => {
    it('can create a custom controls object', () => {
      const customControls: MidasTouchControls = {
        baseRoughness: 0.5,
        transformSpeed: 3.0,
        particleCount: 300,
        particleSize: 0.02,
        glowIntensity: 0.8,
        autoRotateSpeed: 0.2,
        geometryType: 'icosahedron',
      };

      expect(customControls.baseRoughness).toBe(0.5);
      expect(customControls.transformSpeed).toBe(3.0);
      expect(customControls.particleCount).toBe(300);
      expect(customControls.particleSize).toBe(0.02);
      expect(customControls.glowIntensity).toBe(0.8);
      expect(customControls.autoRotateSpeed).toBe(0.2);
      expect(customControls.geometryType).toBe('icosahedron');
    });

    it('can merge with defaults using spread operator', () => {
      const partialOverride: Partial<MidasTouchControls> = {
        glowIntensity: 1.0,
        geometryType: 'sphere',
      };

      const merged: MidasTouchControls = {
        ...DEFAULT_MIDAS_TOUCH_CONTROLS,
        ...partialOverride,
      };

      // Overridden values
      expect(merged.glowIntensity).toBe(1.0);
      expect(merged.geometryType).toBe('sphere');

      // Default values preserved
      expect(merged.baseRoughness).toBe(DEFAULT_MIDAS_TOUCH_CONTROLS.baseRoughness);
      expect(merged.transformSpeed).toBe(DEFAULT_MIDAS_TOUCH_CONTROLS.transformSpeed);
      expect(merged.particleCount).toBe(DEFAULT_MIDAS_TOUCH_CONTROLS.particleCount);
    });
  });
});
