# PCA Hand-Driven Storyboard (Script Pack)

This document describes the script-only blueprint for a 3Blue1Brown-style PCA explainer driven by hand gestures.  
The canonical, implementation-ready data lives in `lib/storyboards/pcaStoryboard.ts`.

## Runtime target

- 3 to 5 minutes total
- 8 to 10 states
- One presenter line per state
- Optional advanced aside per state

## Gesture grammar (human-readable)

- Thumb flick right: advance to next state
- Thumb flick left: return to previous state
- Index pinch + drag: scrub interpolation between current and next state
- Open palm hold: freeze motion and reveal annotations/equations
- Two-hand spread or squeeze: zoom out or in
- Index point: highlight nearest point, axis, or residual vector

Safety guards:

- confidence thresholds per gesture
- hold times to confirm intent
- cooldowns for discrete navigation
- smoothing/clamping for continuous scrub controls

## Story states (overview)

1. Raw cloud
2. Centering at mean
3. Variance scan
4. PC1 emergence
5. PC2 and orthogonality
6. Projection to 2D
7. Reconstruction and residuals
8. Explained variance summary
9. Outlier sensitivity
10. Failure mode on curved manifolds

## Timing style

- Discrete state transitions: smooth `ease_in_out_cubic`
- Reverse transitions: slightly faster than forward
- Scrubbing: direct linear control (no animation lag)
- Camera reframing: short `ease_out_quart` moves for readability

## Implementation handoff

Suggested next implementation pass:

- register `viz8` in `app/hands/visuals-config.ts`
- add visual rendering branch in dynamic routes:
  - `app/hands/[visualId]/page.tsx`
  - `app/hands/[visualId]/control-panel/page.tsx`
  - `app/hands/[visualId]/final_view/page.tsx`
- add a dedicated visual component under `components/hand-tracking`

For exact state text, equation overlays, and safety thresholds, use the exported constants from:

- `PCA_STORY_STATES`
- `PCA_GESTURE_GRAMMAR`
- `PCA_TRANSITION_TIMING`
- `PCA_IMPLEMENTATION_HANDOFF`

