export type TwoHandIndex = 0 | 1;

/**
 * Returns which hand index should be used as the shared "center" when exactly
 * one hand is present. If both (or neither) are present, returns null.
 */
export function getCollapsedCenterHandIndex<T>(
  hands: Array<T | null | undefined>
): TwoHandIndex | null {
  const has0 = Boolean(hands[0]);
  const has1 = Boolean(hands[1]);
  if (has0 === has1) return null; // both present OR both missing
  return has0 ? 0 : 1;
}

