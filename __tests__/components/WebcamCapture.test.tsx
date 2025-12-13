/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { WebcamCapture } from '@/components/video/WebcamCapture';

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn(() =>
      Promise.resolve({
        getTracks: () => [
          {
            stop: jest.fn(),
          },
        ],
      })
    ),
  },
  writable: true,
});

describe('WebcamCapture', () => {
  it('renders start camera button', () => {
    render(<WebcamCapture />);
    expect(screen.getByText('Start Camera')).toBeInTheDocument();
  });

  // Add more tests as needed
});

