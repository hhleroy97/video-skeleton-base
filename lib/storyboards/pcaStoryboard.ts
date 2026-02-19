export type HandPoseName =
  | 'thumb_flick_right'
  | 'thumb_flick_left'
  | 'pinch_index'
  | 'open_palm_hold'
  | 'two_hand_spread'
  | 'two_hand_squeeze'
  | 'index_point';

export interface GestureDefinition {
  command: 'next_state' | 'previous_state' | 'scrub_transition' | 'pause_annotations' | 'camera_zoom' | 'focus_highlight';
  pose: HandPoseName;
  intent: string;
  confidenceThreshold: number;
  holdMs: number;
  cooldownMs: number;
  safetyRule: string;
}

export interface TransitionTimingSpec {
  command: 'next_state' | 'previous_state' | 'scrub_transition' | 'camera_move';
  durationMs: number;
  easing: 'linear' | 'ease_in_out_cubic' | 'ease_out_quart';
  notes: string;
}

export interface SceneState {
  id: string;
  title: string;
  goal: string;
  visualTransforms: string[];
  cameraFraming: string;
  annotations: string[];
  equationOverlay: string;
  audienceTakeaway: string;
  presenterLine: string;
  advancedAside: string;
}

export interface ImplementationHandoff {
  summary: string;
  routeShape: string;
  suggestedVisualId: string;
  integrationTargets: string[];
  stateEngineNotes: string[];
  renderingNotes: string[];
}

export const PCA_GESTURE_GRAMMAR: GestureDefinition[] = [
  {
    command: 'next_state',
    pose: 'thumb_flick_right',
    intent: 'Advance to the next storyboard state in a single discrete step.',
    confidenceThreshold: 0.85,
    holdMs: 80,
    cooldownMs: 420,
    safetyRule: 'Require thumb velocity spike and reject if pinch confidence is high to avoid accidental triggers.',
  },
  {
    command: 'previous_state',
    pose: 'thumb_flick_left',
    intent: 'Return to the previous storyboard state without changing camera context.',
    confidenceThreshold: 0.85,
    holdMs: 80,
    cooldownMs: 420,
    safetyRule: 'Only allow reverse if gesture directionality is stable for 2 consecutive frames.',
  },
  {
    command: 'scrub_transition',
    pose: 'pinch_index',
    intent: 'Continuously interpolate between current and next state to show why the transform works.',
    confidenceThreshold: 0.78,
    holdMs: 120,
    cooldownMs: 0,
    safetyRule: 'Map pinch distance to interpolation t and clamp to [0, 1] with low-pass smoothing.',
  },
  {
    command: 'pause_annotations',
    pose: 'open_palm_hold',
    intent: 'Freeze geometric motion and reveal explanatory labels and equation callouts.',
    confidenceThreshold: 0.8,
    holdMs: 280,
    cooldownMs: 350,
    safetyRule: 'Ignore if hand area is changing too quickly, indicating camera re-entry rather than intentional hold.',
  },
  {
    command: 'camera_zoom',
    pose: 'two_hand_spread',
    intent: 'Zoom out for global context and zoom in for local detail using spread/squeeze.',
    confidenceThreshold: 0.75,
    holdMs: 150,
    cooldownMs: 0,
    safetyRule: 'Activate only when two hands are tracked for at least 5 frames to avoid false positives.',
  },
  {
    command: 'focus_highlight',
    pose: 'index_point',
    intent: 'Highlight nearest point, axis, or residual vector for local explanation.',
    confidenceThreshold: 0.82,
    holdMs: 120,
    cooldownMs: 180,
    safetyRule: 'Raycast against selectable objects and snap to nearest item within angular tolerance.',
  },
];

export const PCA_TRANSITION_TIMING: TransitionTimingSpec[] = [
  {
    command: 'next_state',
    durationMs: 700,
    easing: 'ease_in_out_cubic',
    notes: 'Use for discrete state advances to keep the narration cadence natural.',
  },
  {
    command: 'previous_state',
    durationMs: 620,
    easing: 'ease_in_out_cubic',
    notes: 'Slightly faster reverse transition supports quick correction during live delivery.',
  },
  {
    command: 'scrub_transition',
    durationMs: 0,
    easing: 'linear',
    notes: 'Direct manipulation; interpolation t follows pinch metric continuously each frame.',
  },
  {
    command: 'camera_move',
    durationMs: 500,
    easing: 'ease_out_quart',
    notes: 'Apply to guided camera reframing between states when presenter is not actively orbiting.',
  },
];

export const PCA_STORY_STATES: SceneState[] = [
  {
    id: 'state_01_raw_cloud',
    title: 'Raw Data Cloud',
    goal: 'Introduce a noisy 3D point cloud and motivate the need for structure discovery.',
    visualTransforms: ['Render 3D points with subtle jitter', 'Color points by sample group, but keep overlap visible'],
    cameraFraming: 'Three-quarter orbit view so depth and overlap are both visible.',
    annotations: ['Label: x1, x2, x3 axes', 'Label: high-dimensional intuition from a 3D toy case'],
    equationOverlay: 'X in R^(n x 3)',
    audienceTakeaway: 'Raw coordinates look messy; we need a way to summarize dominant variation.',
    presenterLine: 'We start with raw points in 3D, where pattern exists but is hard to read directly.',
    advancedAside: 'Think of this as a projection of a much larger feature space into three dimensions.',
  },
  {
    id: 'state_02_centering',
    title: 'Centering Around the Mean',
    goal: 'Show why subtracting the mean recenters geometry at the origin.',
    visualTransforms: ['Animate centroid sphere appearing', 'Translate all points by minus mu to recenter at origin'],
    cameraFraming: 'Hold camera fixed to emphasize translation of all points at once.',
    annotations: ['Arrow from centroid to origin', 'Text: remove location, keep shape'],
    equationOverlay: 'Xc = X - 1*mu^T',
    audienceTakeaway: 'Centering removes absolute position so PCA measures spread, not offset.',
    presenterLine: 'By subtracting the mean, we move the cloud to the origin without changing its internal shape.',
    advancedAside: 'If we skip centering, the first component can chase mean offset instead of true variation.',
  },
  {
    id: 'state_03_variance_scan',
    title: 'Variance Scan',
    goal: 'Build intuition that PCA searches for directions with maximal spread.',
    visualTransforms: ['Sweep a candidate axis through space', 'Project points to the axis and show spread bar live'],
    cameraFraming: 'Slow orbit around axis to reveal changing projected lengths.',
    annotations: ['Live metric: projected variance sigma^2(v)', 'Candidate direction vector v'],
    equationOverlay: 'argmax over ||v||=1 of Var(Xc v)',
    audienceTakeaway: 'Different directions preserve different amounts of information.',
    presenterLine: 'As this test axis rotates, the projected spread changes, and we can measure that directly.',
    advancedAside: 'This objective is equivalent to maximizing v^T S v with S as the covariance matrix.',
  },
  {
    id: 'state_04_pc1',
    title: 'Principal Component One',
    goal: 'Reveal the first principal direction as the best single-axis summary.',
    visualTransforms: ['Lock axis at maximal spread direction', 'Brighten PC1 vector and dim non-selected candidates'],
    cameraFraming: 'Align camera slightly with PC1, then offset to preserve depth cues.',
    annotations: ['Label: PC1', 'Explained variance percentage for PC1'],
    equationOverlay: 'S v1 = lambda1 v1',
    audienceTakeaway: 'PC1 is the direction that captures the largest variance in one dimension.',
    presenterLine: 'This brightest axis is PC1, the one direction that keeps the most variation.',
    advancedAside: 'Geometrically, it is the major axis of the covariance ellipsoid.',
  },
  {
    id: 'state_05_pc2_orthogonality',
    title: 'PC2 and Orthogonality',
    goal: 'Show that the second component captures remaining variance subject to orthogonality.',
    visualTransforms: ['Constrain search to plane orthogonal to PC1', 'Reveal PC2 as second bright axis'],
    cameraFraming: 'Rotate to view PC1 and PC2 together as an orthogonal frame.',
    annotations: ['Right-angle marker between PC1 and PC2', 'Residual spread after removing PC1'],
    equationOverlay: 'maximize Var(Xc v) subject to v dot v1 = 0',
    audienceTakeaway: 'PC2 captures the next-best variation not already explained by PC1.',
    presenterLine: 'Now we force a new axis to be perpendicular to PC1 and capture what remains.',
    advancedAside: 'This sequential constraint is why principal components form an orthonormal basis.',
  },
  {
    id: 'state_06_projection_2d',
    title: 'Projection to Two Dimensions',
    goal: 'Demonstrate dimensionality reduction by projecting onto the PC1-PC2 plane.',
    visualTransforms: ['Drop perpendiculars from points to PCA plane', 'Fade original points, keep projected points vivid'],
    cameraFraming: 'Top-down view onto PCA plane, then slight tilt for depth confirmation.',
    annotations: ['Plane label: span(v1, v2)', 'Before/after point count remains unchanged'],
    equationOverlay: 'Z = Xc W2',
    audienceTakeaway: 'We keep the same samples but describe each using fewer coordinates.',
    presenterLine: 'Projecting onto the first two components compresses representation while keeping major structure.',
    advancedAside: 'W2 contains principal directions as columns, so each row in Z is a low-dimensional code.',
  },
  {
    id: 'state_07_reconstruction_error',
    title: 'Reconstruction and Residuals',
    goal: 'Explain information loss by reconstructing and visualizing residual vectors.',
    visualTransforms: ['Lift projected points back to 3D approximation', 'Draw residual arrows from reconstruction to original'],
    cameraFraming: 'Close-in shot on a few samples so residual vectors are legible.',
    annotations: ['Residual norm labels on highlighted samples', 'Average reconstruction error readout'],
    equationOverlay: 'Xhat = Z W2^T + mu',
    audienceTakeaway: 'Compression introduces error; PCA balances compactness and fidelity.',
    presenterLine: 'These arrows are what we lose when we compress, making error visible point by point.',
    advancedAside: 'For squared error, this reconstruction is optimal among all linear 2D subspaces.',
  },
  {
    id: 'state_08_explained_variance',
    title: 'Explained Variance Summary',
    goal: 'Connect geometry back to a practical model-selection metric.',
    visualTransforms: ['Show variance bars for lambda1, lambda2, lambda3', 'Animate cumulative explained variance curve'],
    cameraFraming: 'Split view: 3D cloud on left, variance chart on right.',
    annotations: ['Cumulative threshold markers at 90 and 95 percent', 'Selected dimensionality highlight'],
    equationOverlay: 'explained_k = sum(i<=k) lambda_i / sum(all) lambda_i',
    audienceTakeaway: 'Explained variance gives a principled rule for choosing reduced dimension.',
    presenterLine: 'The eigenvalue bars tell us exactly how much signal each component retains.',
    advancedAside: 'In practice we often choose k where the cumulative curve reaches a target threshold.',
  },
  {
    id: 'state_09_outlier_sensitivity',
    title: 'Outlier Sensitivity',
    goal: 'Show PCA behavior change when extreme points are introduced.',
    visualTransforms: ['Inject outlier points in a distant direction', 'Recompute and tilt PC1 toward outliers'],
    cameraFraming: 'Wide framing that includes both core cloud and outliers.',
    annotations: ['Warning badge: outlier-sensitive', 'Before/after PC1 angle delta'],
    equationOverlay: 'Covariance amplifies large-distance points',
    audienceTakeaway: 'PCA can be strongly influenced by outliers and may need robust preprocessing.',
    presenterLine: 'A few distant points can rotate the principal axis and change the story.',
    advancedAside: 'Robust PCA variants or trimming strategies help when tails are heavy.',
  },
  {
    id: 'state_10_failure_modes',
    title: 'When PCA Fails',
    goal: 'Clarify that PCA is linear and may miss nonlinear manifold structure.',
    visualTransforms: ['Morph cloud into curved manifold', 'Show linear plane fit leaving curved residual pattern'],
    cameraFraming: 'Orbit around curved shape to emphasize nonlinearity.',
    annotations: ['Label: linear subspace assumption', 'Prompt: consider kernel or manifold methods'],
    equationOverlay: 'Linear projection cannot unwrap curved geometry',
    audienceTakeaway: 'PCA is powerful but not universal; match method to geometry.',
    presenterLine: 'If structure is curved, a linear plane cannot fully capture it.',
    advancedAside: 'This is where methods like kernel PCA, UMAP, or autoencoders can help.',
  },
];

export const PCA_IMPLEMENTATION_HANDOFF: ImplementationHandoff = {
  summary: 'Implement as a new scripted hand visual with discrete scene states plus continuous interpolation control.',
  routeShape: '/hands/viz8 and /hands/viz8/control-panel with optional /hands/viz8/final_view',
  suggestedVisualId: 'viz8',
  integrationTargets: [
    '/app/hands/visuals-config.ts',
    '/app/hands/[visualId]/page.tsx',
    '/app/hands/[visualId]/control-panel/page.tsx',
    '/app/hands/[visualId]/final_view/page.tsx',
    '/components/hand-tracking',
  ],
  stateEngineNotes: [
    'Use an integer stateIndex for discrete slide navigation and a float t in [0, 1] for transition scrubbing.',
    'Persist scene defaults per state: camera pose, annotation visibility, equation text, and visual parameters.',
    'Apply cooldown guards from gesture grammar before mutating stateIndex.',
  ],
  renderingNotes: [
    'Render with dark background, restrained color accents, and smooth easing to mirror explanatory math visuals.',
    'Keep equations contextual: reveal only during relevant state and anchor near corresponding geometry.',
    'Prefer object constancy during transforms so the audience can track identity across states.',
  ],
};

