import { getVisualConfig } from '@/app/hands/visuals-config';

describe('visuals-config flower lifecycle entry', () => {
  it('registers viz10 with FlowerLifecycleVisual', () => {
    const viz10 = getVisualConfig('viz10');
    expect(viz10).toBeDefined();
    expect(viz10?.component).toBe('FlowerLifecycleVisual');
    expect(viz10?.enabled).toBe(true);
  });

  it('registers viz11 with StepFlowerDebugVisual', () => {
    const viz11 = getVisualConfig('viz11');
    expect(viz11).toBeDefined();
    expect(viz11?.component).toBe('StepFlowerDebugVisual');
    expect(viz11?.enabled).toBe(true);
  });
});
