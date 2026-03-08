# Flower Lifecycle Asset Notes

This visual (`viz10`) is a reusable generative line-art module rather than a one-off effect.

## Runtime Contract

- Component: `components/hand-tracking/FlowerLifecycleVisual.tsx`
- Lifecycle math: `lib/flowerLifecycle.ts`
- Generative model: `lib/flowerLineArt.ts`

## Timeline

- Input timeline is normalized `0..1`.
- Phase windows:
  - `0.00 -> 0.45`: grow
  - `0.45 -> 0.70`: bloom
  - `0.70 -> 1.00`: wilt

The utility returns deterministic values for growth scale, bloom openness, droop, desaturation, and petal curl.

## Generative Structure

- Stem/branch network is generated from an L-system expansion.
- Stem branches are rendered as smooth spline tube meshes (Catmull-Rom + TubeGeometry) for organic continuity.
- Petals are generated as sampled cubic Bezier curves across multiple blossom clusters.
- Leaves are generated as branch-attached Bezier leaf pairs that grow and wilt with the same timeline.
- Each lifecycle loop generates a new seed variant.
- The entire structure is transformed as one connected organism so growth and wilt propagate coherently from base to bloom.

## Artistic Direction

- Minimal line-only rendering (no decorative mesh parts).
- Succinct silhouette-first composition with subtle motion.
- Controlled variation via seeded randomness for repeatable generative outputs.
