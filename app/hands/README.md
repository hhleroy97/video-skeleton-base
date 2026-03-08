# Hand Tracking Visualizations

This directory contains the hand tracking visualization system with support for multiple visuals, each with their own control panel.

## Structure

```
/hands
  ├── page.tsx                    # Redirects to `/` (hands is now the base route)
  ├── visuals-config.ts          # Configuration for all visuals
  ├── [visualId]/
  │   ├── page.tsx               # Dynamic route for DEV fullscreen view (debug/testing)
  │   ├── final_view/
  │   │   └── page.tsx           # Dynamic route for USER-facing final view (custom layout area)
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

In `/hands/[visualId]/page.tsx`, `/hands/[visualId]/final_view/page.tsx`, and `/hands/[visualId]/control-panel/page.tsx`,
add a case in the `renderVisual()` function:

```typescript
case 'YourComponentType':
  return <YourComponent vector={pinchVector} />;
```

### Step 3: Create Your Component (if needed)

Create your visualization component in `/components/hand-tracking/` following the pattern of existing components.

## Routes

- `/` - Main navigation page showing all available visuals (**new base route**)
- `/[visualId]/final_view` - **Final View** (user-facing fullscreen + custom layout area)
- `/[visualId]` - Dev fullscreen view of a specific visual
- `/[visualId]/control-panel` - Control panel for a specific visual

## Tracking toggles

- **Body tracking (global)**: a global toggle on the home page (`/`). This is intended to control any body-tracking
  features/visuals (present or future) from one place.
- **Hand tracking (per visual)**: each visual card on the home page includes a **Hand tracking enabled** toggle.
  When disabled, the visual still renders but **no camera hand-tracking is processed** for that visual, so it will not react.
  You can also toggle this inside the visual pages (Dev Fullscreen / Control Panel / Final View).

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
- `VideoPoseUploadVisual` - Upload a video and run MediaPipe body pose overlay
- `FlowerLifecycleVisual` - Reusable 3D flower asset autoplaying grow/bloom/wilt lifecycle
- `StepFlowerDebugVisual` - Isolated debug lab for viz9 flower marker rendering

## Storyboard Script Packs

For presentation-first visuals, we keep reusable storyboard scripts that can be implemented as full visuals later.

- **PCA deck (script-only)**:
  - Overview: `app/hands/PCA_STORYBOARD.md`
  - Canonical typed script data: `lib/storyboards/pcaStoryboard.ts`
  - Validation tests: `__tests__/lib/pcaStoryboard.test.ts`

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

## Midas Touch (viz7)

Transform materials with your hands: a gesture-based material selector with camera control.

- **Route**: `/hands/viz7`
- **Control panel**: `/hands/viz7/control-panel`
- **Interaction**:
  - **Right hand** controls camera orbit around the object (move hand to rotate view)
  - **No right hand** = auto-rotating camera view
  - **Left hand pinch gestures** step materials:
    - **Thumb + Index** pinch = **Previous** material
    - **Thumb + Middle** pinch = **Next** material
    - (Hold the pinch briefly; it edge-triggers to avoid rapid cycling)
- **Controls**:
  - **Transform Speed**: how quickly the material color transitions
  - **Particle Count**: number of spark particles around the object
  - **Particle Size**: size of the spark particles
  - **Auto Rotate Speed**: camera rotation speed when no right hand detected
  - **Geometry**: shape of the central object (Torus Knot, Icosahedron, Sphere, Dodecahedron)
- **UI Overlay**: Shows current finger count, selected material, and camera control status
- **Business applications**: Material preview for e-commerce, product configurators, interactive presentations
- **Visual notes**: Smooth transitions, particle bursts on material change, and high-contrast material variety (ceramic → satin metal → frosted glass → neon glow)

## PCA Story Theater (viz8)

A hand-driven 3D storytelling visual for PCA, designed for presentation flow and geometric intuition.

- **Route**: `/hands/viz8`
- **Control panel**: `/hands/viz8/control-panel`
- **Interaction**:
  - **On-screen arrows** (mouse): previous/next storyboard state
  - **Keyboard arrows**: left = previous, right = next
  - Hand-driven navigation/scrubbing is currently disabled
- **Camera behavior**:
  - Camera starts at a fixed initial pose for each page load
  - Mouse drag rotates/orbits around the scene
- **Transition behavior**:
  - Point clouds animate along interpolated paths between states (no instant popping)
- **Visual flow**:
  - Raw cloud → centering → principal directions → projection → reconstruction → explained variance → caveats
- **Data source**:
  - Script/state definitions: `lib/storyboards/pcaStoryboard.ts`
  - Runtime interpolation helpers: `lib/storyboards/pcaStoryRuntime.ts`

## Video Pose Upload (viz9)

Upload any prerecorded video and apply MediaPipe Pose body tracking directly on top of it.

- **Route**: `/hands/viz9`
- **Control panel**: `/hands/viz9/control-panel`
- **Interaction**:
  - Upload video file (`video/*`)
  - Press **Play / Pause** to run analysis
  - Choose **trim start / trim end** to focus on a section
  - Enable **Loop within trim window** to repeatedly play the selected segment
  - Pose skeleton and landmarks render on top of the uploaded clip
  - Step events use a smoothed gait-phase detector (`stance`/`swing`) with contact-aware hysteresis
  - Step markers are color-coded by foot (left/right) on-video and on the timeline strip
  - Markers shift using border-based camera-motion estimation (camera/global motion, not body-following)
  - Step marker style can switch between classic boxes, growing flowers, and growing flowers (3D)
  - Flower markers now use seeded style variants (multiple growth templates + curated palettes), not only left/right foot colors
  - Branching variants can spawn side stems that terminate as mini petals, leaves, or bare ends for extra silhouette diversity
  - Main blossoms can render in multiple petal layers at offset heights/phases with layer-specific colors for added depth
  - Stems are constrained to green tones, and leaves now render with dark-bottom to light-top gradient fills
  - Toon texture mode can switch between `none`, `stipple`, and `hatch` for petal/leaf interior shading
  - Flower marker animation now runs through a state machine (`growing -> holding -> decaying`) with state-driven plant transforms (sway, droop, scale, offset)
  - Petals now bloom from a tight clustered bud to a full spread opening during growth
  - Decay timing is intentionally longer to make wilt behavior read clearly in motion
  - During decay, pollen disappears first, leaves droop/drop and shift toward fall tones, petals transition into fall colors, and stems shift from greens through olive to brown while shrinking
  - Branch stems and attached leaves inherit parent-stem motion, so connected structures stay spatially coherent while the plant wilts
  - Blossom centers include a pollen core for added visual readability
  - Includes a shared **whimsy intensity** control to scale outlines and squash/stretch behavior
  - Adds dedicated **Bloom timing** and **Decay timing** sliders for tuning flower lifecycle speed
  - Includes a **Body tracking model** toggle to disable pose/segmentation processing while keeping marker playback controls available
  - Includes a **Show body cam points** toggle to hide/show the full pose overlay (landmark dots + body lines) on top of the video
  - Realtime mode includes a **Background segmentation (flowers behind person)** toggle that composites the person above flower markers
  - Marker controls sync across upload/realtime and persist across visual pages (dev, final view, and control panel)
  - Final view includes a camera-motion vector overlay (`dx`, `dy`)
  - **Step sensitivity slider** tunes detection as a percentage of heel-to-ankle span (scale-aware in 3D/depth changes)
  - **Point size scale** slider controls marker-size amplification while preserving relative step magnitude
  - Includes a foot-motion isolator sub-window with left/right 2D layouts of ankle, heel, and toe points
- **Notes**:
  - Uses MediaPipe Pose with a 33-point landmark overlay
  - Designed for demos, analysis clips, and presentation-ready body tracking replays

## Flower Lifecycle (viz10)

A reusable 3D asset visual that plays a full flower lifecycle in 3D space: growth, bloom, and wilting.

- **Route**: `/hands/viz10`
- **Control panel**: `/hands/viz10/control-panel`
- **Final view**: `/hands/viz10/final_view`
- **Interaction**:
  - Autoplay timeline by default (no hand-tracking required)
  - Loops through phases: `grow -> bloom -> wilt`
  - Generates a new flower variation at each loop boundary, with multiple connected blossoms
  - Adds branch-attached leaves that emerge with stem growth and wilt with the same lifecycle
  - Accepts normalized phase override (`0..1`) for deterministic external control
- **Implementation notes**:
  - Timeline math lives in `lib/flowerLifecycle.ts` (pure utility, testable)
  - Line-art generation lives in `lib/flowerLineArt.ts`
  - Visual component lives in `components/hand-tracking/FlowerLifecycleVisual.tsx`
  - Uses L-system branching for connected stem/branch structure and cubic Bezier curves for petals
  - Entire flower grows/wilts as one connected line organism (not independent part scaling)

## Step Flower Marker Lab (viz11)

Dedicated debug surface for the flower markers used by `VideoPoseUploadVisual` (`viz9`).

- **Route**: `/hands/viz11`
- **Control panel**: `/hands/viz11/control-panel`
- **Final view**: `/hands/viz11/final_view`
- **Purpose**:
  - Iterate on the flower marker look and timing without requiring video upload or realtime pose input
  - Reuses `lib/stepFlowerAsset.ts` generation paths (`flowers` and `flowers-3d`) so visual tweaks match viz9 marker behavior
  - Keeps grow/hold/shrink lifecycle behavior aligned with marker animation tuning
  - Cycles through seeded flower variants with different growth templates and palette sets
  - Includes toon outlines, squash/stretch bloom, and sparkle accents to preview the final whimsical look
- **Controls**:
  - Marker style (`Growing flowers` or `Growing flowers (3D)`)
  - Step magnitude, point scale, bloom timing, decay timing, spawn interval, and whimsy intensity

## Features

- **Automatic Navigation**: Visuals are automatically added to the main navigation page
- **Dynamic Routing**: Each visual gets its own route automatically
- **Control Panels**: Each visual has a dedicated control panel with camera feed and data
- **Shared State**: All visuals use the same hand tracking system
- **FPS Overlay**: Fullscreen + control panel views show a small FPS counter (bottom-left) to quickly spot performance regressions
