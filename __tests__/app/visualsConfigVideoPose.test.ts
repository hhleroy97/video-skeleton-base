import { getVisualConfig } from '@/app/hands/visuals-config';

describe('visuals-config video pose upload entry', () => {
  it('registers viz9 with VideoPoseUploadVisual', () => {
    const viz9 = getVisualConfig('viz9');
    expect(viz9).toBeDefined();
    expect(viz9?.component).toBe('VideoPoseUploadVisual');
    expect(viz9?.enabled).toBe(true);
    expect(viz9?.tag).toBe('Data visualization');
  });
});

