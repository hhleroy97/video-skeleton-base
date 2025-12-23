export type ConstellationPaletteId =
  | 'classic'
  | 'aurora'
  | 'sunset'
  | 'neon'
  | 'cyberpunk'
  | 'toxic'
  | 'ember'
  | 'sakura'
  | 'electric'
  | 'ocean'
  | 'rainbow'
  | 'void';

export type Handedness = 'Left' | 'Right';

export interface ConstellationPalette {
  id: ConstellationPaletteId;
  name: string;
  description: string;
  /**
   * Base hues are HSL hue values in [0..1].
   * We keep Left/Right separate so handedness can still feel distinct.
   */
  hues: {
    nebula: Record<Handedness, number>;
    stars: Record<Handedness, number>;
    lines: Record<Handedness, number>;
  };
  /** Base saturation (0..1). Higher = more vivid. Default 0.6 */
  saturation: number;
  /** Base lightness (0..1). Higher = brighter particles. Default 0.45 */
  lightness: number;
}

export const CONSTELLATION_PALETTES: ReadonlyArray<ConstellationPalette> = [
  {
    id: 'classic',
    name: 'Classic (Cool/Warm)',
    description: 'Blue/cool for left, warm/gold for right (original vibe).',
    hues: {
      nebula: { Left: 0.6, Right: 0.0 },
      stars: { Left: 0.6, Right: 0.12 },
      lines: { Left: 0.55, Right: 0.08 },
    },
    saturation: 0.6,
    lightness: 0.45,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights: emerald greens and deep violets.',
    hues: {
      nebula: { Left: 0.38, Right: 0.78 },
      stars: { Left: 0.35, Right: 0.82 },
      lines: { Left: 0.4, Right: 0.75 },
    },
    saturation: 0.7,
    lightness: 0.5,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Fiery dusk: deep oranges and magentas.',
    hues: {
      nebula: { Left: 0.05, Right: 0.92 },
      stars: { Left: 0.08, Right: 0.95 },
      lines: { Left: 0.03, Right: 0.88 },
    },
    saturation: 0.75,
    lightness: 0.5,
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Bright synthwave: vivid cyan and magenta.',
    hues: {
      nebula: { Left: 0.5, Right: 0.92 },
      stars: { Left: 0.52, Right: 0.95 },
      lines: { Left: 0.48, Right: 0.9 },
    },
    saturation: 1.0,
    lightness: 0.6,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Dark neon: deep blue/purple with hot pink accents.',
    hues: {
      nebula: { Left: 0.72, Right: 0.95 },
      stars: { Left: 0.7, Right: 0.97 },
      lines: { Left: 0.68, Right: 0.93 },
    },
    saturation: 1.0,
    lightness: 0.52,
  },
  {
    id: 'toxic',
    name: 'Toxic',
    description: 'Radioactive: acid green and toxic yellow.',
    hues: {
      nebula: { Left: 0.28, Right: 0.18 },
      stars: { Left: 0.3, Right: 0.15 },
      lines: { Left: 0.25, Right: 0.12 },
    },
    saturation: 1.0,
    lightness: 0.55,
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Molten fire: deep reds, oranges, and golds.',
    hues: {
      nebula: { Left: 0.0, Right: 0.08 },
      stars: { Left: 0.02, Right: 0.1 },
      lines: { Left: 0.98, Right: 0.06 },
    },
    saturation: 0.9,
    lightness: 0.5,
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Cherry blossom: vibrant pinks and soft magentas.',
    hues: {
      nebula: { Left: 0.92, Right: 0.95 },
      stars: { Left: 0.9, Right: 0.97 },
      lines: { Left: 0.88, Right: 0.93 },
    },
    saturation: 0.85,
    lightness: 0.58,
  },
  {
    id: 'electric',
    name: 'Electric',
    description: 'High voltage: bright blue and electric yellow.',
    hues: {
      nebula: { Left: 0.58, Right: 0.15 },
      stars: { Left: 0.6, Right: 0.13 },
      lines: { Left: 0.55, Right: 0.17 },
    },
    saturation: 1.0,
    lightness: 0.58,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep water: rich teals, aquas, and deep blues.',
    hues: {
      nebula: { Left: 0.55, Right: 0.48 },
      stars: { Left: 0.58, Right: 0.52 },
      lines: { Left: 0.5, Right: 0.45 },
    },
    saturation: 0.85,
    lightness: 0.5,
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    description: 'Full spectrum: left hand warm, right hand cool, all colors.',
    hues: {
      nebula: { Left: 0.08, Right: 0.58 },
      stars: { Left: 0.0, Right: 0.5 },
      lines: { Left: 0.15, Right: 0.65 },
    },
    saturation: 1.0,
    lightness: 0.55,
  },
  {
    id: 'void',
    name: 'Void',
    description: 'Near-monochrome with faint violet hints.',
    hues: {
      nebula: { Left: 0.74, Right: 0.74 },
      stars: { Left: 0.72, Right: 0.72 },
      lines: { Left: 0.7, Right: 0.7 },
    },
    saturation: 0.25,
    lightness: 0.35,
  },
] as const;

export function isConstellationPaletteId(value: string): value is ConstellationPaletteId {
  return (CONSTELLATION_PALETTES as ReadonlyArray<{ id: string }>).some((p) => p.id === value);
}

export function getConstellationPalette(id: ConstellationPaletteId): ConstellationPalette {
  return (
    CONSTELLATION_PALETTES.find((p) => p.id === id) ??
    // Should be unreachable, but keep runtime safe.
    (CONSTELLATION_PALETTES[0] as ConstellationPalette)
  );
}

export function getConstellationHues(args: { paletteId: ConstellationPaletteId; handedness: Handedness }) {
  const palette = getConstellationPalette(args.paletteId);
  return {
    nebulaHue: palette.hues.nebula[args.handedness],
    starHue: palette.hues.stars[args.handedness],
    lineHue: palette.hues.lines[args.handedness],
    saturation: palette.saturation,
    lightness: palette.lightness,
  };
}

