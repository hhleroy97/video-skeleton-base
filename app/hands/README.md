# Hand Tracking Visualizations

This directory contains the hand tracking visualization system with support for multiple visuals, each with their own control panel.

## Structure

```
/hands
  ├── page.tsx                    # Main navigation page (lists all visuals)
  ├── visuals-config.ts          # Configuration for all visuals
  ├── [visualId]/
  │   ├── page.tsx               # Dynamic route for visual fullscreen view
  │   └── control-panel/
  │       └── page.tsx           # Dynamic route for visual control panel
  └── viz1/                      # Legacy route (still works)
      ├── page.tsx
      └── control-panel/
          └── page.tsx
```

## Adding a New Visual

### Step 1: Add to Configuration

Edit `visuals-config.ts` and add your new visual:

```typescript
{
  id: 'viz2',  // Unique identifier (used in URL)
  name: 'My New Visual',
  description: 'Description of what this visual does',
  component: 'PinchControlled3D',  // Component type
  fullscreen: true,  // Whether to show in fullscreen mode
  enabled: true,  // Set to false to hide from navigation
}
```

### Step 2: Add Component Case

In both `/hands/[visualId]/page.tsx` and `/hands/[visualId]/control-panel/page.tsx`, add a case in the `renderVisual()` function:

```typescript
case 'YourComponentType':
  return <YourComponent vector={pinchVector} />;
```

### Step 3: Create Your Component (if needed)

Create your visualization component in `/components/hand-tracking/` following the pattern of existing components.

## Routes

- `/hands` - Main navigation page showing all available visuals
- `/hands/[visualId]` - Fullscreen view of a specific visual
- `/hands/[visualId]/control-panel` - Control panel for a specific visual

## Saved Configurations

All visuals with configurable controls (Prism Hand, One Line, and Constellation) support saving and loading custom configurations. This allows you to:

- **Save your current settings** with a custom name for later use
- **Load previously saved configurations** to quickly switch between different visual styles
- **Delete saved configurations** you no longer need

### How to Use

1. Adjust the sliders and controls to your desired settings
2. In the "Saved Configurations" card, enter a name for your configuration
3. Click "Save" to store the current settings
4. To load a saved configuration, click the "Load" button next to the configuration name
5. To delete a configuration, click the "Delete" button

### Storage

Configurations are stored in your browser's localStorage, so they persist across page refreshes but are specific to your browser and device. Each visual type (viz4, viz5, viz6) maintains its own separate list of saved configurations.

## Available Component Types

- `PinchControlled3D` - 3D orbital system visualization
- `PinchControlledVisual` - 2D visual element (to be implemented)
- `FinalVectorVisual` - Vector-based visualization (to be implemented)
- `Hand3DVisual` - 3D hand landmark scene (skeleton or GLB model overlay)

## Hand3DVisual GLB Overlay (viz3)

To render a real 3D model instead of just the landmark skeleton:

- **Drop your GLB here**: `public/models/rigged_hand.glb`
- **It will be served at**: `/models/rigged_hand.glb`
- **Switch view mode**:
  - Fullscreen view: top-right buttons **Skeleton / Model**
  - Control panel: **Skeleton / Model** buttons above the 3D preview

By default, the rigged model is positioned at the **wrist** (landmark 0), oriented using a **palm basis**, and (if bones are present) the fingers are driven from MediaPipe joint directions.

## Prism Hand (viz4)

An impressionistic “glass/prism” hand made from refractive shards along the hand bones.

- **Route**: `/hands/viz4`
- **Control panel**: `/hands/viz4/control-panel`
- **Interaction**: pinch to intensify the refraction/clarity (subtle material change)
- **Controls**:
  - Fullscreen (`/hands/viz4`): top-right sliders (Spin, Twist, Hue speed, Opacity, Reset)
  - Control panel (`/hands/viz4/control-panel`): “Prism Controls” card

## One Unbroken Line (viz5)

A minimalist "Picasso-style" continuous stroke that threads through all 21 landmarks.

- **Route**: `/hands/viz5`
- **Control panel**: `/hands/viz5/control-panel`
- **Interaction**: pinch affects color saturation; movement is captured in real-time
- **Controls**:
  - **Noise Amount**: perpendicular displacement (fractal-like wobble)
  - **Noise Scale**: frequency of the noise along the path
  - **Draw Speed**: 0 = instant drawing; higher = animated reveal (line "traces" itself)
  - **Line Width**: stroke thickness
- Hue drifts over time and along the path for a living gradient

## Constellation / Pocket Universe (viz6)

Your hand as a cosmos: 21 dim stars floating in deep space, with nebulae blooming as you move.

- **Route**: `/hands/viz6`
- **Control panel**: `/hands/viz6/control-panel`
- **Interaction**:
  - Pinch brightens stars (nebula brightness stays stable)
  - Spreading fingers reveals more distant cosmic structure
  - If only one hand is detected, both nebula centers collapse to the remaining hand until the second hand returns
- **Controls**:
  - **Star Brightness**: base intensity of the landmark stars
  - **Color palette**: choose different hue pairings for the nebula + stars + lines
    - *Classic*: Blue/cool vs warm/gold (original)
    - *Aurora*: Emerald greens and deep violets
    - *Sunset*: Fiery oranges and magentas
    - *Neon*: Vivid cyan and magenta (synthwave)
    - *Cyberpunk*: Deep blue/purple with hot pink (dark neon)
    - *Toxic*: Acid green and radioactive yellow
    - *Ember*: Molten reds, oranges, and golds
    - *Sakura*: Soft cherry blossom pinks
    - *Electric*: Bright blue and electric yellow
    - *Ocean*: Deep teals, aquas, and rich blues
    - *Rainbow*: Full spectrum (warm left, cool right)
    - *Void*: Near-monochrome violet
  - **Nebula Intensity**: visibility of the particle cloud around the palm
  - **Nebula Radius**: how large the nebula cloud is around the hand
  - **Nebula Count**: number of nebula particles (“spheres”)
  - **Nebula Particle Size**: visual size of the nebula particles
  - **Constellation Lines**: opacity of connecting lines between landmarks
  - **Cosmic Depth**: background star density (how deep the universe feels)
  - **Twinkle Speed**: star shimmer rate
  - **Show hand skeleton**: overlays a brighter hand skeleton on top of the scene
  - **Flocking Physics**: attraction/separation/motion push/damping
  - **Galaxy Field**: core pull, orbit swirl, spiral arms + turbulence
  - **Nebula trails**: draws short additive trails for nebula particles (length/opacity controls)
- **Palette notes**: palettes keep left/right distinct (unless the palette intentionally unifies them).

## Features

- **Automatic Navigation**: Visuals are automatically added to the main navigation page
- **Dynamic Routing**: Each visual gets its own route automatically
- **Control Panels**: Each visual has a dedicated control panel with camera feed and data
- **Shared State**: All visuals use the same hand tracking system
- **FPS Overlay**: Fullscreen + control panel views show a small FPS counter (bottom-left) to quickly spot performance regressions
