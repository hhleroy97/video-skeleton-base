/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { FpsOverlay } from '@/components/perf/FpsOverlay';

describe('FpsOverlay', () => {
  it('renders and updates FPS over time', () => {
    const rafQueue: FrameRequestCallback[] = [];
    const caf = jest.fn();

    // Minimal RAF mock: enqueue callbacks, let the test drive "frames"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).cancelAnimationFrame = caf;

    render(<FpsOverlay sampleMs={1000} />);
    expect(screen.getByTestId('fps-overlay')).toHaveTextContent('FPS: 0');

    // Drive ~60 frames over ~1000ms
    let now = 0;
    for (let i = 0; i < 65; i++) {
      now += 16.6667;
      act(() => {
        const cb = rafQueue.shift();
        if (!cb) throw new Error('RAF callback missing');
        cb(now);
      });
    }

    // After one sample window, FPS should be non-zero and near 60.
    const text = screen.getByTestId('fps-overlay').textContent ?? '';
    const match = text.match(/FPS:\s*(\d+)/);
    expect(match).not.toBeNull();
    const value = Number(match?.[1]);
    expect(value).toBeGreaterThanOrEqual(40);
  });
});

