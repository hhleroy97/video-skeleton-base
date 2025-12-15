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

## Available Component Types

- `PinchControlled3D` - 3D orbital system visualization
- `PinchControlledVisual` - 2D visual element (to be implemented)
- `FinalVectorVisual` - Vector-based visualization (to be implemented)

## Features

- **Automatic Navigation**: Visuals are automatically added to the main navigation page
- **Dynamic Routing**: Each visual gets its own route automatically
- **Control Panels**: Each visual has a dedicated control panel with camera feed and data
- **Shared State**: All visuals use the same hand tracking system
