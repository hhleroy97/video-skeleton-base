import {
  PCA_GESTURE_GRAMMAR,
  PCA_IMPLEMENTATION_HANDOFF,
  PCA_STORY_STATES,
  PCA_TRANSITION_TIMING,
} from '@/lib/storyboards/pcaStoryboard';

describe('pcaStoryboard script spec', () => {
  it('provides a complete storyboard deck with 8-10 states', () => {
    expect(PCA_STORY_STATES.length).toBeGreaterThanOrEqual(8);
    expect(PCA_STORY_STATES.length).toBeLessThanOrEqual(10);
  });

  it('ensures each state has required narrative and visual fields', () => {
    for (const state of PCA_STORY_STATES) {
      expect(state.id).toMatch(/^state_/);
      expect(state.title.length).toBeGreaterThan(0);
      expect(state.goal.length).toBeGreaterThan(0);
      expect(state.visualTransforms.length).toBeGreaterThan(0);
      expect(state.cameraFraming.length).toBeGreaterThan(0);
      expect(state.annotations.length).toBeGreaterThan(0);
      expect(state.equationOverlay.length).toBeGreaterThan(0);
      expect(state.audienceTakeaway.length).toBeGreaterThan(0);
      expect(state.presenterLine.length).toBeGreaterThan(0);
      expect(state.advancedAside.length).toBeGreaterThan(0);
    }
  });

  it('contains no duplicate state ids', () => {
    const ids = PCA_STORY_STATES.map(state => state.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('defines core gesture commands with safety constraints', () => {
    const commands = PCA_GESTURE_GRAMMAR.map(item => item.command);

    expect(commands).toContain('next_state');
    expect(commands).toContain('previous_state');
    expect(commands).toContain('scrub_transition');
    expect(commands).toContain('pause_annotations');
    expect(commands).toContain('camera_zoom');
    expect(commands).toContain('focus_highlight');

    for (const gesture of PCA_GESTURE_GRAMMAR) {
      expect(gesture.confidenceThreshold).toBeGreaterThanOrEqual(0.7);
      expect(gesture.confidenceThreshold).toBeLessThanOrEqual(0.95);
      expect(gesture.holdMs).toBeGreaterThanOrEqual(0);
      expect(gesture.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(gesture.safetyRule.length).toBeGreaterThan(10);
    }
  });

  it('defines transition timing for navigation, scrubbing, and camera motion', () => {
    const commands = PCA_TRANSITION_TIMING.map(item => item.command);

    expect(commands).toContain('next_state');
    expect(commands).toContain('previous_state');
    expect(commands).toContain('scrub_transition');
    expect(commands).toContain('camera_move');
  });

  it('includes explicit integration targets for future implementation', () => {
    expect(PCA_IMPLEMENTATION_HANDOFF.suggestedVisualId).toBe('viz8');
    expect(PCA_IMPLEMENTATION_HANDOFF.integrationTargets).toContain('/app/hands/visuals-config.ts');
    expect(PCA_IMPLEMENTATION_HANDOFF.integrationTargets).toContain('/app/hands/[visualId]/page.tsx');
    expect(PCA_IMPLEMENTATION_HANDOFF.stateEngineNotes.length).toBeGreaterThan(0);
    expect(PCA_IMPLEMENTATION_HANDOFF.renderingNotes.length).toBeGreaterThan(0);
  });
});

