/**
 * Configuration for all available hand tracking visuals
 * Add new visuals here to automatically add them to navigation
 */
export interface VisualConfig {
  id: string;
  name: string;
  description: string;
  tag?: string;
  component:
    | 'PinchControlled3D'
    | 'PinchControlledVisual'
    | 'FinalVectorVisual'
    | 'BasicHandTracking'
    | 'Hand3DVisual'
    | 'PrismHandVisual'
    | 'OneLineHandVisual'
    | 'ConstellationVisual'
    | 'MidasTouchVisual'
    | 'PcaStoryVisual'
    | 'VideoPoseUploadVisual'
    | 'FlowerLifecycleVisual'
    | 'StepFlowerDebugVisual';
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
  {
    id: 'viz7',
    name: 'Midas Touch',
    description: 'Transform materials with your hands: clay to gold, stone to crystal. Hand proximity triggers alchemical transformation.',
    component: 'MidasTouchVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz8',
    name: 'PCA Story Theater',
    description: 'Hand-driven 3D PCA explainer with scene states, interpolation scrubbing, and presentation overlays.',
    tag: 'Data visualization',
    component: 'PcaStoryVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz9',
    name: 'Video Pose Upload',
    description: 'Upload any video and apply MediaPipe body tracking with a real-time pose overlay.',
    tag: 'Data visualization',
    component: 'VideoPoseUploadVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz10',
    name: 'Flower Lifecycle',
    description: 'Reusable 3D flower asset that grows, blooms, and wilts on an autoplay loop.',
    component: 'FlowerLifecycleVisual',
    fullscreen: true,
    enabled: true,
  },
  {
    id: 'viz11',
    name: 'Step Flower Marker Lab',
    description: 'Debug lab for the viz9 flower step-marker renderer (2D and pseudo-3D styles).',
    component: 'StepFlowerDebugVisual',
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
