import { COMBO_TIMEOUT, COMBO_SCORE_MULTIPLIER } from '@shared/constants';

/**
 * Configuration for combo system
 */
export const COMBO_CONFIG = {
  /** Time in ms before combo resets */
  timeout: COMBO_TIMEOUT,
  /** Score multiplier increase per combo kill */
  scoreMultiplier: COMBO_SCORE_MULTIPLIER,
};

/**
 * State for combo tracking
 */
export interface ComboState {
  comboCount: number;
  comboTimer: number;
  maxCombo: number;
}

/**
 * Calculate the combo multiplier for scoring.
 * Formula: 1 + (comboCount - 1) * COMBO_SCORE_MULTIPLIER
 *
 * @param comboCount - Current combo count
 * @returns Score multiplier
 */
export function calculateComboMultiplier(comboCount: number): number {
  return 1 + (comboCount - 1) * COMBO_CONFIG.scoreMultiplier;
}

/**
 * Calculate final score with combo multiplier applied.
 *
 * @param baseScore - Base score for the kill
 * @param comboCount - Current combo count
 * @returns Final score (floored to integer)
 */
export function calculateScore(baseScore: number, comboCount: number): number {
  const multiplier = calculateComboMultiplier(comboCount);
  return Math.floor(baseScore * multiplier);
}

/**
 * Event types for combo state updates
 */
export type ComboEvent = 'kill' | 'tick';

/**
 * Update combo state based on game events.
 * Pure function for testability.
 *
 * @param state - Current combo state
 * @param event - Event type ('kill' for enemy kill, 'tick' for time decay)
 * @param dt - Delta time in ms (only used for 'tick' event)
 * @returns New combo state
 */
export function updateComboState(
  state: ComboState,
  event: ComboEvent,
  dt: number = 0
): ComboState {
  const { comboCount, comboTimer, maxCombo } = state;

  if (event === 'kill') {
    const newCount = comboCount + 1;
    return {
      comboCount: newCount,
      comboTimer: COMBO_CONFIG.timeout,
      maxCombo: Math.max(maxCombo, newCount),
    };
  }

  // event === 'tick'
  if (comboTimer <= 0) {
    return { comboCount: 0, comboTimer: 0, maxCombo };
  }

  const newTimer = Math.max(0, comboTimer - dt);
  if (newTimer <= 0) {
    return { comboCount: 0, comboTimer: 0, maxCombo };
  }

  return { comboCount, comboTimer: newTimer, maxCombo };
}
