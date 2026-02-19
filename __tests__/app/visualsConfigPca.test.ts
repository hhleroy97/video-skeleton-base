import { getVisualConfig } from '@/app/hands/visuals-config';

describe('visuals-config PCA entry', () => {
  it('registers viz8 with the PcaStoryVisual component', () => {
    const viz8 = getVisualConfig('viz8');
    expect(viz8).toBeDefined();
    expect(viz8?.component).toBe('PcaStoryVisual');
    expect(viz8?.enabled).toBe(true);
  });
});

