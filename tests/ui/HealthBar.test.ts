/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthBar, DEFAULT_HEALTH_CONFIG } from '../../src/ui/components/HealthBar';

describe('HealthBar', () => {
  let container: HTMLElement;
  let fillElement: HTMLElement;

  beforeEach(() => {
    // Set up DOM
    container = document.createElement('div');
    container.id = 'health-container';

    fillElement = document.createElement('div');
    fillElement.id = 'health-fill';
    container.appendChild(fillElement);

    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('initialization', () => {
    it('should find health fill element', () => {
      const healthBar = new HealthBar('health-fill');
      expect(healthBar).toBeDefined();
    });

    it('should use default config', () => {
      const healthBar = new HealthBar();
      healthBar.update(100, 100);

      expect(fillElement.style.width).toBe('100%');
    });
  });

  describe('update', () => {
    it('should set width based on health percentage', () => {
      const healthBar = new HealthBar();

      healthBar.update(50, 100);

      expect(fillElement.style.width).toBe('50%');
    });

    it('should handle full health', () => {
      const healthBar = new HealthBar();

      healthBar.update(100, 100);

      expect(fillElement.style.width).toBe('100%');
    });

    it('should handle zero health', () => {
      const healthBar = new HealthBar();

      healthBar.update(0, 100);

      expect(fillElement.style.width).toBe('0%');
    });

    it('should handle different max health values', () => {
      const healthBar = new HealthBar();

      healthBar.update(50, 200);

      expect(fillElement.style.width).toBe('25%');
    });
  });

  describe('color coding', () => {
    it('should use critical color when health <= 25%', () => {
      const healthBar = new HealthBar();

      healthBar.update(25, 100);

      // Browser normalizes hex to rgb, so check for presence of gradient with red
      expect(fillElement.style.background).toContain('linear-gradient');
      expect(fillElement.style.background).toContain('rgb(255, 0, 0)');
    });

    it('should use warning color when health is 26-50%', () => {
      const healthBar = new HealthBar();

      healthBar.update(50, 100);

      // Orange warning color
      expect(fillElement.style.background).toContain('linear-gradient');
      expect(fillElement.style.background).toContain('rgb(255, 102, 0)');
    });

    it('should use normal color when health > 50%', () => {
      const healthBar = new HealthBar();

      healthBar.update(51, 100);

      // Normal red color (lighter)
      expect(fillElement.style.background).toContain('linear-gradient');
      expect(fillElement.style.background).toContain('rgb(255, 68, 68)');
    });

    it('should use custom colors from config', () => {
      const customColors = {
        critical: 'red',
        warning: 'orange',
        normal: 'green',
      };
      const healthBar = new HealthBar('health-fill', { colors: customColors });

      healthBar.update(25, 100);
      expect(fillElement.style.background).toBe('red');

      healthBar.update(50, 100);
      expect(fillElement.style.background).toBe('orange');

      healthBar.update(75, 100);
      expect(fillElement.style.background).toBe('green');
    });

    it('should use custom thresholds', () => {
      const healthBar = new HealthBar('health-fill', {
        criticalThreshold: 30,
        warningThreshold: 60,
      });

      healthBar.update(30, 100);
      expect(fillElement.style.background).toContain('rgb(255, 0, 0)'); // Critical

      healthBar.update(60, 100);
      expect(fillElement.style.background).toContain('rgb(255, 102, 0)'); // Warning

      healthBar.update(61, 100);
      expect(fillElement.style.background).toContain('rgb(255, 68, 68)'); // Normal
    });
  });

  describe('damage detection', () => {
    it('should call onDamageTaken when health decreases', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(100);
      healthBar.update(80, 100);

      expect(callback).toHaveBeenCalledWith(20, expect.any(Number));
    });

    it('should calculate intensity based on damage', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(100);
      healthBar.update(70, 100); // 30 damage

      // Intensity = min(30/30, 1) = 1
      expect(callback).toHaveBeenCalledWith(30, 1);
    });

    it('should cap intensity at 1', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(100);
      healthBar.update(40, 100); // 60 damage

      // Intensity should cap at 1
      expect(callback).toHaveBeenCalledWith(60, 1);
    });

    it('should not call callback when health increases', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(50);
      healthBar.update(70, 100); // Healing

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not call callback when health stays same', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(50);
      healthBar.update(50, 100);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should track damage across multiple updates', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(100);
      healthBar.update(90, 100); // 10 damage
      healthBar.update(80, 100); // 10 more damage

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should work with null callback', () => {
      const healthBar = new HealthBar();
      healthBar.setOnDamageTaken(null);

      // Should not throw
      expect(() => {
        healthBar.reset(100);
        healthBar.update(80, 100);
      }).not.toThrow();
    });
  });

  describe('getHealthPercent', () => {
    it('should return correct percentage', () => {
      const healthBar = new HealthBar();

      expect(healthBar.getHealthPercent(50, 100)).toBe(50);
      expect(healthBar.getHealthPercent(25, 100)).toBe(25);
      expect(healthBar.getHealthPercent(100, 200)).toBe(50);
    });
  });

  describe('reset', () => {
    it('should reset lastHealth tracking', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset(100);
      healthBar.update(80, 100); // First damage

      healthBar.reset(80); // Reset to current health
      healthBar.update(80, 100); // No damage

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should default to 100', () => {
      const healthBar = new HealthBar();
      const callback = vi.fn();
      healthBar.setOnDamageTaken(callback);

      healthBar.reset();
      healthBar.update(90, 100);

      expect(callback).toHaveBeenCalledWith(10, expect.any(Number));
    });
  });
});
