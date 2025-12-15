/**
 * Configuration for all available hand tracking visuals
 * Add new visuals here to automatically add them to navigation
 */
export interface VisualConfig {
  id: string;
  name: string;
  description: string;
  component: 'PinchControlled3D' | 'PinchControlledVisual' | 'FinalVectorVisual';
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
  // Add more visuals here as they are created
  // {
  //   id: 'viz2',
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
