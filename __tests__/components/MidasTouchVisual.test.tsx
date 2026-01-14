import { DEFAULT_MIDAS_TOUCH_CONTROLS, type MidasTouchControls } from '@/components/hand-tracking/MidasTouchVisual';

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
