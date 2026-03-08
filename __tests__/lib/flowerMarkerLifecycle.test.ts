import { getFlowerMarkerLifecycleFrame } from '@/lib/flowerMarkerLifecycle';

describe('flowerMarkerLifecycle', () => {
  const timings = {
    growSeconds: 0.4,
    holdSeconds: 0.22,
    decaySeconds: 0.34,
  };

  it('transitions through growing, holding, decaying states', () => {
    const growing = getFlowerMarkerLifecycleFrame(0.12, timings, 1);
    const holding = getFlowerMarkerLifecycleFrame(0.45, timings, 1);
    const decaying = getFlowerMarkerLifecycleFrame(0.8, timings, 1);
    expect(growing.state).toBe('growing');
    expect(holding.state).toBe('holding');
    expect(decaying.state).toBe('decaying');
  });

  it('returns zero lifeScale after lifecycle duration', () => {
    const done = getFlowerMarkerLifecycleFrame(2, timings, 1);
    expect(done.lifeScale).toBe(0);
    expect(done.state).toBe('decaying');
    expect(done.stateProgress).toBe(1);
  });

  it('applies state-driven transform changes', () => {
    const early = getFlowerMarkerLifecycleFrame(0.08, timings, 1.2);
    const hold = getFlowerMarkerLifecycleFrame(0.5, timings, 1.2);
    const late = getFlowerMarkerLifecycleFrame(0.85, timings, 1.2);
    expect(early.transform.scaleY).toBeGreaterThan(0.5);
    expect(hold.transform.scaleX).toBeGreaterThan(0.7);
    expect(late.transform.droop).toBeGreaterThan(0.05);
    expect(late.transform.offsetY).toBeLessThanOrEqual(0);
  });

  it('supports longer decay windows without ending early', () => {
    const longDecayTimings = {
      growSeconds: 0.4,
      holdSeconds: 0.22,
      decaySeconds: 1.2,
    };
    const midDecay = getFlowerMarkerLifecycleFrame(1.0, longDecayTimings, 1);
    const notDone = getFlowerMarkerLifecycleFrame(1.6, longDecayTimings, 1);
    const done = getFlowerMarkerLifecycleFrame(1.9, longDecayTimings, 1);

    expect(midDecay.state).toBe('decaying');
    expect(midDecay.stateProgress).toBeLessThan(0.35);
    expect(notDone.lifeScale).toBeGreaterThan(0);
    expect(done.lifeScale).toBe(0);
  });

  it('ramps droop across the decay window', () => {
    const decayTimings = {
      growSeconds: 0.4,
      holdSeconds: 0.22,
      decaySeconds: 1.2,
    };
    const decayStartTime = decayTimings.growSeconds + decayTimings.holdSeconds;
    const earlyDecay = getFlowerMarkerLifecycleFrame(decayStartTime + 0.08, decayTimings, 1.1);
    const lateDecay = getFlowerMarkerLifecycleFrame(decayStartTime + 0.95, decayTimings, 1.1);

    expect(earlyDecay.state).toBe('decaying');
    expect(lateDecay.state).toBe('decaying');
    expect(lateDecay.transform.droop).toBeGreaterThan(earlyDecay.transform.droop);
  });
});
