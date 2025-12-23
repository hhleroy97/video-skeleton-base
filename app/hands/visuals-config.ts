/**
 * Configuration for all available hand tracking visuals
 * Add new visuals here to automatically add them to navigation
 */
export interface VisualConfig {
  id: string;
  name: string;
  description: string;
  component:
    | 'PinchControlled3D'
    | 'PinchControlledVisual'
    | 'FinalVectorVisual'
    | 'BasicHandTracking'
    | 'Hand3DVisual'
    | 'PrismHandVisual'
    | 'OneLineHandVisual'
    | 'ConstellationVisual';
  fullscreen?: boolean;
  enabled: boolean;
}

export const visualsConfig: VisualConfig[] = [
  {
    id: 'viz1',
    name: '3D Orbital System',
    description: 'Fullscreen 3D Voronoi-connected orbital system with toon-shaded voxels',
    component: 'PinchControlled3D',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz2',
    name: 'Basic Hand Tracking',
    description: 'Simple hand tracking visualization with skeleton overlay',
    component: 'BasicHandTracking',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz3',
    name: '3D Hand Visualization',
    description: 'Real-time 3D visualization of hand landmarks in 3D space',
    component: 'Hand3DVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz4',
    name: 'Prism Hand (Impressionistic)',
    description: 'Glass-like prism shards that trace hand bones with pinch-reactive refraction',
    component: 'PrismHandVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz5',
    name: 'One Unbroken Line',
    description: 'Minimalist continuous stroke through all landmarks with subtle noise and animated drawing',
    component: 'OneLineHandVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz6',
    name: 'Constellation (Pocket Universe)',
    description: 'Hand as a cosmos: 21 stars with nebulae, constellation lines, and cosmic depth',
    component: 'ConstellationVisual',
    fullscreen: true,
    enabled: true,
  },
  // Add more visuals here as they are created
  // {
  //   id: 'viz3',
  //   name: '2D Vector Visual',
  //   description: 'Simple 2D visual element controlled by pinch gestures',
  //   component: 'PinchControlledVisual',
  //   fullscreen: false,
  //   enabled: true,
  // },
];

export function getVisualConfig(id: string): VisualConfig | undefined {
  return visualsConfig.find(viz => viz.id === id && viz.enabled);
}

export function getAllEnabledVisuals(): VisualConfig[] {
  return visualsConfig.filter(viz => viz.enabled);
}
