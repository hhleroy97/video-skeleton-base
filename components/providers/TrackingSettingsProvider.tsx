'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type HandTrackingEnabledByVisual = Record<string, boolean>;

export interface TrackingSettingsContextValue {
  /** Global toggle for body tracking (used by any body-tracking UI/features). */
  bodyTrackingEnabled: boolean;
  setBodyTrackingEnabled: (next: boolean) => void;

  /** Per-visual toggle for hand tracking (default: true). */
  isHandTrackingEnabledForVisual: (visualId: string) => boolean;
  setHandTrackingEnabledForVisual: (visualId: string, enabled: boolean) => void;
  handTrackingEnabledByVisual: HandTrackingEnabledByVisual;
}

const TrackingSettingsContext = createContext<TrackingSettingsContextValue | null>(null);

const STORAGE_KEYS = {
  body: 'tracking:bodyEnabled',
  handsByVisual: 'tracking:handsEnabledByVisual',
} as const;

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function TrackingSettingsProvider({ children }: { children: React.ReactNode }) {
  const [bodyTrackingEnabled, setBodyTrackingEnabledState] = useState(false);
  const [handTrackingEnabledByVisual, setHandTrackingEnabledByVisual] = useState<HandTrackingEnabledByVisual>({});

  // Load from localStorage once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedBody = safeParseJson<boolean>(localStorage.getItem(STORAGE_KEYS.body));
    if (typeof storedBody === 'boolean') {
      setBodyTrackingEnabledState(storedBody);
    }

    const storedHands = safeParseJson<HandTrackingEnabledByVisual>(localStorage.getItem(STORAGE_KEYS.handsByVisual));
    if (storedHands && typeof storedHands === 'object') {
      setHandTrackingEnabledByVisual(storedHands);
    }
  }, []);

  const setBodyTrackingEnabled = useCallback((next: boolean) => {
    setBodyTrackingEnabledState(next);
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.body, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  }, []);

  const isHandTrackingEnabledForVisual = useCallback(
    (visualId: string) => {
      // Default is enabled unless explicitly disabled
      const value = handTrackingEnabledByVisual[visualId];
      return value !== false;
    },
    [handTrackingEnabledByVisual]
  );

  const setHandTrackingEnabledForVisual = useCallback((visualId: string, enabled: boolean) => {
    setHandTrackingEnabledByVisual((prev) => {
      const next = { ...prev, [visualId]: enabled };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEYS.handsByVisual, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  const value: TrackingSettingsContextValue = useMemo(
    () => ({
      bodyTrackingEnabled,
      setBodyTrackingEnabled,
      isHandTrackingEnabledForVisual,
      setHandTrackingEnabledForVisual,
      handTrackingEnabledByVisual,
    }),
    [
      bodyTrackingEnabled,
      setBodyTrackingEnabled,
      isHandTrackingEnabledForVisual,
      setHandTrackingEnabledForVisual,
      handTrackingEnabledByVisual,
    ]
  );

  return <TrackingSettingsContext.Provider value={value}>{children}</TrackingSettingsContext.Provider>;
}

export function useTrackingSettings(): TrackingSettingsContextValue {
  const ctx = useContext(TrackingSettingsContext);
  if (!ctx) {
    throw new Error('useTrackingSettings must be used within TrackingSettingsProvider');
  }
  return ctx;
}

