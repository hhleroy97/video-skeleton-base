import { CONSTELLATION_PALETTES, getConstellationHues, isConstellationPaletteId } from '@/components/hand-tracking/constellationPalettes';

describe('constellationPalettes', () => {
  it('exposes a non-empty palette list with unique ids', () => {
    expect(CONSTELLATION_PALETTES.length).toBeGreaterThan(0);
    const ids = CONSTELLATION_PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recognizes valid palette ids', () => {
    for (const p of CONSTELLATION_PALETTES) {
      expect(isConstellationPaletteId(p.id)).toBe(true);
    }
    expect(isConstellationPaletteId('not-a-real-palette')).toBe(false);
  });

  it('maps classic hues to the original values', () => {
    expect(getConstellationHues({ paletteId: 'classic', handedness: 'Left' })).toEqual({
      nebulaHue: 0.6,
      starHue: 0.6,
      lineHue: 0.55,
      saturation: 0.6,
      lightness: 0.45,
    });
    expect(getConstellationHues({ paletteId: 'classic', handedness: 'Right' })).toEqual({
      nebulaHue: 0.0,
      starHue: 0.12,
      lineHue: 0.08,
      saturation: 0.6,
      lightness: 0.45,
    });
  });

  it('neon palette has higher saturation than classic', () => {
    const neon = getConstellationHues({ paletteId: 'neon', handedness: 'Left' });
    const classic = getConstellationHues({ paletteId: 'classic', handedness: 'Left' });
    expect(neon.saturation).toBeGreaterThan(classic.saturation);
  });

  it('void palette has lower saturation and lightness', () => {
    const voidP = getConstellationHues({ paletteId: 'void', handedness: 'Left' });
    expect(voidP.saturation).toBeLessThan(0.4);
    expect(voidP.lightness).toBeLessThan(0.4);
  });
});

