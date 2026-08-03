/**
 * Cosmic narrative model for Microlearn.
 *
 * Hierarchy (presentation language — persisted IDs unchanged):
 * - Learner → Explorer / Observer
 * - Library → Universe
 * - Subject → Galaxy
 * - Roadmap → Expedition (constellation chart)
 * - Unit → Star system / Sector
 * - Lesson → Celestial destination
 * - Lesson cards → Observations / discoveries
 * - Review → Objects in orbit (memory reinforcement)
 * - Mastery → Stabilized / illuminated body
 * - Completed knowledge → Visible constellations
 * - XP → Stellar energy
 *
 * Primary actions keep clear labels (e.g. "Start lesson"); cosmic language enriches, not obscures.
 */

import type { RoadmapNodeStatus } from '@/types/roadmap';

/** Presentation labels for roadmap node statuses. Stored status values are unchanged. */
export const NODE_STATUS_LABEL: Record<RoadmapNodeStatus, string> = {
  locked: 'Uncharted',
  available: 'Detected',
  active: 'In orbit',
  completed: 'Illuminated',
  generating: 'Forming',
  error: 'Signal lost',
};

/** Short accessible hint for each status (icon + label already convey state). */
export const NODE_STATUS_HINT: Record<RoadmapNodeStatus, string> = {
  locked: 'Complete prior destinations to chart this one',
  available: 'Ready to explore',
  active: 'Your current destination',
  completed: 'Knowledge charted',
  generating: 'Lesson material is forming',
  error: 'Generation failed — tap to retry',
};

export type CosmicBadgeTier = 'first_light' | 'orbit' | 'stellar' | 'nebula' | 'event_horizon';

/** Map persisted achievement tiers to cosmic presentation tiers. */
export function cosmicTierFromAchievementTier(
  tier: string | undefined,
): CosmicBadgeTier {
  switch (tier) {
    case 'legendary':
      return 'event_horizon';
    case 'gold':
      return 'nebula';
    case 'silver':
      return 'stellar';
    case 'bronze':
    default:
      return 'orbit';
  }
}

export const COSMIC_TIER_LABEL: Record<CosmicBadgeTier, string> = {
  first_light: 'First Light',
  orbit: 'Orbit',
  stellar: 'Stellar',
  nebula: 'Nebula',
  event_horizon: 'Event Horizon',
};

export const COSMIC_COPY = {
  xpLabel: 'Stellar energy',
  libraryEyebrow: 'Your universe',
  pathsEyebrow: 'Expeditions',
  reviewEyebrow: 'Objects in orbit',
  completionTitle: 'Destination illuminated',
  emptyUniverseTitle: 'The universe awaits',
  emptyUniverseMessage: 'Start an expedition or generate a lesson to chart your first constellation.',
} as const;
