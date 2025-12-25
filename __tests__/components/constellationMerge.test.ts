import { getCollapsedCenterHandIndex } from '@/components/hand-tracking/constellationMerge';

describe('constellationMerge', () => {
  it('returns null when both hands are present', () => {
    expect(getCollapsedCenterHandIndex([{}, {}])).toBeNull();
  });

  it('returns null when neither hand is present', () => {
    expect(getCollapsedCenterHandIndex([null, undefined])).toBeNull();
  });

  it('returns 0 when only hand 0 is present', () => {
    expect(getCollapsedCenterHandIndex([{}, null])).toBe(0);
  });

  it('returns 1 when only hand 1 is present', () => {
    expect(getCollapsedCenterHandIndex([undefined, {}])).toBe(1);
  });
});

