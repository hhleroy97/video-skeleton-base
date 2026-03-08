import { render, screen } from '@testing-library/react';
import { StepFlowerDebugVisual } from '@/components/hand-tracking/StepFlowerDebugVisual';

describe('StepFlowerDebugVisual', () => {
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ setTransform: jest.fn(), clearRect: jest.fn(), fillRect: jest.fn() } as unknown as CanvasRenderingContext2D)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders marker lab controls', () => {
    render(<StepFlowerDebugVisual />);

    expect(screen.getByText(/Step Flower Marker Lab/i)).toBeInTheDocument();
    expect(screen.getByText(/Debug Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/Spawn interval/i)).toBeInTheDocument();
    expect(screen.getByText(/Bloom timing/i)).toBeInTheDocument();
    expect(screen.getByText(/Decay timing/i)).toBeInTheDocument();
    expect(screen.getByText(/Whimsy intensity/i)).toBeInTheDocument();
    expect(screen.getByText(/Toon texture/i)).toBeInTheDocument();
  });
});
