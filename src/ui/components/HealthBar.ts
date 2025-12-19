/**
 * HealthBar - Renders and updates the health bar UI
 *
 * Single Responsibility: Display health with color-coded states
 */

export interface HealthBarColors {
  critical: string;
  warning: string;
  normal: string;
}

export interface HealthBarConfig {
  criticalThreshold: number;
  warningThreshold: number;
  colors: HealthBarColors;
}

export const DEFAULT_HEALTH_CONFIG: HealthBarConfig = {
  criticalThreshold: 25,
  warningThreshold: 50,
  colors: {
    critical: 'linear-gradient(90deg, #ff0000, #ff3333)',
    warning: 'linear-gradient(90deg, #ff6600, #ff9933)',
    normal: 'linear-gradient(90deg, #ff4444, #ff6666)',
  },
};

export type HealthChangeCallback = (damageTaken: number, intensity: number) => void;

export class HealthBar {
  private fillElement: HTMLElement;
  private lastHealth = 100;
  private config: HealthBarConfig;
  private onDamageTaken: HealthChangeCallback | null = null;

  constructor(
    fillElementId: string = 'health-fill',
    config: Partial<HealthBarConfig> = {}
  ) {
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this.fillElement = document.getElementById(fillElementId)!;
  }

  setOnDamageTaken(callback: HealthChangeCallback | null): void {
    this.onDamageTaken = callback;
  }

  update(health: number, maxHealth: number): void {
    const healthPercent = (health / maxHealth) * 100;

    // Update width
    this.fillElement.style.width = `${healthPercent}%`;

    // Detect damage and trigger callback
    if (health < this.lastHealth && this.onDamageTaken) {
      const damageTaken = this.lastHealth - health;
      const intensity = Math.min(damageTaken / 30, 1);
      this.onDamageTaken(damageTaken, intensity);
    }
    this.lastHealth = health;

    // Update color based on health level
    this.updateColor(healthPercent);
  }

  private updateColor(healthPercent: number): void {
    if (healthPercent <= this.config.criticalThreshold) {
      this.fillElement.style.background = this.config.colors.critical;
    } else if (healthPercent <= this.config.warningThreshold) {
      this.fillElement.style.background = this.config.colors.warning;
    } else {
      this.fillElement.style.background = this.config.colors.normal;
    }
  }

  /**
   * Get the current health percentage for low health effects
   */
  getHealthPercent(health: number, maxHealth: number): number {
    return (health / maxHealth) * 100;
  }

  /**
   * Reset the last health tracking (e.g., on game restart)
   */
  reset(initialHealth: number = 100): void {
    this.lastHealth = initialHealth;
  }
}
