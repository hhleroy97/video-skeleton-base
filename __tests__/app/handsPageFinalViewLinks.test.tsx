/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { HandsHome } from '@/app/hands/HandsHome';
import { getAllEnabledVisuals } from '@/app/hands/visuals-config';
import { TrackingSettingsProvider } from '@/components/providers/TrackingSettingsProvider';

jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

jest.mock('@/components/hand-tracking/HandTracking', () => {
  return {
    __esModule: true,
    HandTracking: () => <div data-testid="hand-tracking-mock" />,
  };
});

describe('HandsPage', () => {
  it('links primary view to /final_view for each visual', () => {
    render(
      <TrackingSettingsProvider>
        <HandsHome />
      </TrackingSettingsProvider>
    );

    const finalViewLinks = screen.getAllByRole('link', { name: /final view/i });
    expect(finalViewLinks.length).toBeGreaterThan(0);
    for (const link of finalViewLinks) {
      expect(link).toHaveAttribute('href', expect.stringContaining('/final_view'));
    }
  });

  it('shows a Hand tracking badge for each visual card', () => {
    render(
      <TrackingSettingsProvider>
        <HandsHome />
      </TrackingSettingsProvider>
    );

    const badges = screen.getAllByText('Hand tracking');
    expect(badges.length).toBe(getAllEnabledVisuals().length);
  });

  it('shows the global Body tracking toggle on the home page', () => {
    render(
      <TrackingSettingsProvider>
        <HandsHome />
      </TrackingSettingsProvider>
    );

    expect(screen.getByText('Body tracking')).toBeInTheDocument();
  });

  it('shows a per-visual Hand tracking enabled toggle for each visual', () => {
    render(
      <TrackingSettingsProvider>
        <HandsHome />
      </TrackingSettingsProvider>
    );

    const toggles = screen.getAllByText(/hand tracking enabled/i);
    expect(toggles.length).toBe(getAllEnabledVisuals().length);
  });
});

