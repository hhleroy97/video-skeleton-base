import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FlowerLifecycleVisual } from '@/components/hand-tracking/FlowerLifecycleVisual';

jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="canvas-mock">{children}</div>,
  useFrame: () => undefined,
}));

jest.mock('@react-three/drei', () => {
  const useGLTF = Object.assign(
    () => ({
      scene: {
        traverse: () => undefined,
      },
    }),
    { preload: jest.fn() }
  );

  return {
    OrbitControls: () => null,
    PerspectiveCamera: () => null,
    useGLTF,
  };
});

jest.mock('three-stdlib', () => ({
  SkeletonUtils: {
    clone: (value: unknown) => value,
  },
}));

describe('FlowerLifecycleVisual', () => {
  it('renders with L-system line-art notice', async () => {
    render(<FlowerLifecycleVisual />);

    await waitFor(() => {
      expect(screen.getByText(/L-system \+ Bezier line mode/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('canvas-mock')).toBeInTheDocument();
  });
});
