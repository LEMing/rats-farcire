import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, getEventBus, resetEventBus } from '../../src/core/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on/emit', () => {
    it('should call handler when event is emitted', () => {
      const handler = vi.fn();
      eventBus.on('screenShake', handler);

      eventBus.emit('screenShake', { intensity: 0.5 });

      expect(handler).toHaveBeenCalledWith({ intensity: 0.5 });
    });

    it('should call multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('enemyKilled', handler1);
      eventBus.on('enemyKilled', handler2);

      eventBus.emit('enemyKilled', {
        position: { x: 1, y: 0, z: 2 },
        enemyType: 'rat',
        score: 100,
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should call handler multiple times for multiple emits', () => {
      const handler = vi.fn();
      eventBus.on('screenShake', handler);

      eventBus.emit('screenShake', { intensity: 0.3 });
      eventBus.emit('screenShake', { intensity: 0.5 });
      eventBus.emit('screenShake', { intensity: 0.7 });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should not call handlers for different events', () => {
      const handler = vi.fn();
      eventBus.on('screenShake', handler);

      eventBus.emit('waveStarted', { waveNumber: 1, enemyCount: 5 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('should unsubscribe handler', () => {
      const handler = vi.fn();
      eventBus.on('screenShake', handler);

      eventBus.off('screenShake', handler);
      eventBus.emit('screenShake', { intensity: 0.5 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function from on()', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('screenShake', handler);

      unsubscribe();
      eventBus.emit('screenShake', { intensity: 0.5 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('screenShake', handler1);
      eventBus.on('screenShake', handler2);

      eventBus.off('screenShake', handler1);
      eventBus.emit('screenShake', { intensity: 0.5 });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should call handler only once', () => {
      const handler = vi.fn();
      eventBus.once('waveCompleted', handler);

      eventBus.emit('waveCompleted', { waveNumber: 1 });
      eventBus.emit('waveCompleted', { waveNumber: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ waveNumber: 1 });
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.once('waveCompleted', handler);

      unsubscribe();
      eventBus.emit('waveCompleted', { waveNumber: 1 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all listeners for specific event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.on('screenShake', handler1);
      eventBus.on('screenShake', handler2);
      eventBus.on('waveStarted', handler3);

      eventBus.clear('screenShake');

      eventBus.emit('screenShake', { intensity: 0.5 });
      eventBus.emit('waveStarted', { waveNumber: 1, enemyCount: 5 });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should remove all listeners when no event specified', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('screenShake', handler1);
      eventBus.on('waveStarted', handler2);

      eventBus.clear();

      eventBus.emit('screenShake', { intensity: 0.5 });
      eventBus.emit('waveStarted', { waveNumber: 1, enemyCount: 5 });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return 0 for event with no listeners', () => {
      expect(eventBus.listenerCount('screenShake')).toBe(0);
    });

    it('should return correct count', () => {
      eventBus.on('screenShake', vi.fn());
      eventBus.on('screenShake', vi.fn());
      eventBus.on('waveStarted', vi.fn());

      expect(eventBus.listenerCount('screenShake')).toBe(2);
      expect(eventBus.listenerCount('waveStarted')).toBe(1);
    });

    it('should decrement after unsubscribe', () => {
      const handler = vi.fn();
      eventBus.on('screenShake', handler);
      eventBus.on('screenShake', vi.fn());

      expect(eventBus.listenerCount('screenShake')).toBe(2);

      eventBus.off('screenShake', handler);

      expect(eventBus.listenerCount('screenShake')).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should continue calling other handlers if one throws', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      eventBus.on('screenShake', errorHandler);
      eventBus.on('screenShake', successHandler);

      // Should not throw
      eventBus.emit('screenShake', { intensity: 0.5 });

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('type safety', () => {
    it('should accept correct payload types', () => {
      const handler = vi.fn();
      eventBus.on('cellDelivered', handler);

      eventBus.emit('cellDelivered', { cellNumber: 1, totalCells: 3 });

      expect(handler).toHaveBeenCalledWith({ cellNumber: 1, totalCells: 3 });
    });

    it('should handle complex event payloads', () => {
      const handler = vi.fn();
      eventBus.on('gameOver', handler);

      eventBus.emit('gameOver', { won: true, score: 1500, wave: 5 });

      expect(handler).toHaveBeenCalledWith({ won: true, score: 1500, wave: 5 });
    });
  });
});

describe('Global EventBus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  it('should return same instance on multiple calls', () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();

    expect(bus1).toBe(bus2);
  });

  it('should reset global instance', () => {
    const bus1 = getEventBus();
    bus1.on('screenShake', vi.fn());

    resetEventBus();

    const bus2 = getEventBus();
    expect(bus2.listenerCount('screenShake')).toBe(0);
  });
});
