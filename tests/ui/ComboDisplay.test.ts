/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComboDisplay, DEFAULT_COMBO_CONFIG } from '../../src/ui/components/ComboDisplay';

describe('ComboDisplay', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Set up DOM
    container = document.createElement('div');
    container.id = 'ui-overlay';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('initialization', () => {
    it('should create combo display element', () => {
      const display = new ComboDisplay();

      expect(document.getElementById('combo-display')).not.toBeNull();
      display.destroy();
    });

    it('should start hidden', () => {
      const display = new ComboDisplay();
      const element = display.getElement();

      expect(element.style.opacity).toBe('0');
      display.destroy();
    });

    it('should contain count element', () => {
      const display = new ComboDisplay();
      const element = display.getElement();
      const countEl = element.querySelector('.combo-count');

      expect(countEl).not.toBeNull();
      display.destroy();
    });

    it('should contain bar element', () => {
      const display = new ComboDisplay();
      const element = display.getElement();
      const barEl = element.querySelector('.combo-bar-fill');

      expect(barEl).not.toBeNull();
      display.destroy();
    });
  });

  describe('update', () => {
    it('should show when combo > 0', () => {
      const display = new ComboDisplay();

      display.update(1, 2000);

      expect(display.getElement().style.opacity).toBe('1');
      display.destroy();
    });

    it('should hide when combo is 0', () => {
      const display = new ComboDisplay();

      display.update(5, 2000); // Show first
      display.update(0, 0); // Then hide

      expect(display.getElement().style.opacity).toBe('0');
      display.destroy();
    });

    it('should hide when combo is undefined', () => {
      const display = new ComboDisplay();

      display.update(5, 2000); // Show first
      display.update(undefined, undefined); // Then hide

      expect(display.getElement().style.opacity).toBe('0');
      display.destroy();
    });

    it('should display combo count', () => {
      const display = new ComboDisplay();
      const countEl = display.getElement().querySelector('.combo-count') as HTMLElement;

      display.update(5, 2000);

      expect(countEl.textContent).toBe('5x');
      display.destroy();
    });

    it('should update timer bar width', () => {
      const display = new ComboDisplay();
      const barEl = display.getElement().querySelector('.combo-bar-fill') as HTMLElement;

      display.update(5, 1000); // 50% of default 2000ms timeout

      expect(barEl.style.width).toBe('50%');
      display.destroy();
    });

    it('should show full timer bar at max timer', () => {
      const display = new ComboDisplay();
      const barEl = display.getElement().querySelector('.combo-bar-fill') as HTMLElement;

      display.update(5, 2000); // Full timeout

      expect(barEl.style.width).toBe('100%');
      display.destroy();
    });
  });

  describe('scaling', () => {
    it('should scale up with higher combo', () => {
      const display = new ComboDisplay();

      display.update(1, 2000);
      const scale1 = parseFloat(display.getElement().style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1');

      display.update(10, 2000);
      display.update(10, 2000); // Multiple updates to converge
      display.update(10, 2000);
      const scale10 = parseFloat(display.getElement().style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1');

      expect(scale10).toBeGreaterThan(scale1);
      display.destroy();
    });

    it('should cap scale at maxScale', () => {
      const display = new ComboDisplay('ui-overlay', { maxScale: 1.3 });

      // Update many times to converge
      for (let i = 0; i < 20; i++) {
        display.update(100, 2000);
      }

      const scale = parseFloat(display.getElement().style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1');
      expect(scale).toBeLessThanOrEqual(1.3);
      display.destroy();
    });

    it('should reset scale when hidden', () => {
      const display = new ComboDisplay();

      display.update(10, 2000);
      display.update(0, 0); // Hide

      // Internal scale should reset
      display.update(1, 2000);
      const scale = parseFloat(display.getElement().style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1');

      expect(scale).toBeLessThan(1.2);
      display.destroy();
    });
  });

  describe('color', () => {
    it('should change color based on combo intensity', () => {
      const display = new ComboDisplay();
      const countEl = display.getElement().querySelector('.combo-count') as HTMLElement;

      display.update(1, 2000);
      const color1 = countEl.style.color;

      display.update(10, 2000);
      const color10 = countEl.style.color;

      expect(color1).not.toBe(color10);
      display.destroy();
    });
  });

  describe('configuration', () => {
    it('should use custom comboTimeout', () => {
      const display = new ComboDisplay('ui-overlay', { comboTimeout: 5000 });
      const barEl = display.getElement().querySelector('.combo-bar-fill') as HTMLElement;

      display.update(5, 2500); // 50% of 5000ms

      expect(barEl.style.width).toBe('50%');
      display.destroy();
    });
  });

  describe('destroy', () => {
    it('should remove element from DOM', () => {
      const display = new ComboDisplay();
      expect(document.getElementById('combo-display')).not.toBeNull();

      display.destroy();

      expect(document.getElementById('combo-display')).toBeNull();
    });
  });
});
