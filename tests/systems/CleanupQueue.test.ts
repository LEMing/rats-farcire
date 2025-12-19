import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CleanupQueue, CleanupTask } from '../../src/systems/CleanupQueue';

describe('CleanupQueue', () => {
  let queue: CleanupQueue;

  beforeEach(() => {
    queue = new CleanupQueue();
  });

  describe('schedule', () => {
    it('should add task to queue', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);

      expect(queue.size()).toBe(1);
    });

    it('should allow multiple tasks', () => {
      queue.schedule('enemy-1', 500, vi.fn());
      queue.schedule('enemy-2', 600, vi.fn());
      queue.schedule('enemy-3', 400, vi.fn());

      expect(queue.size()).toBe(3);
    });

    it('should replace task with same id', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      queue.schedule('enemy-1', 500, callback1);
      queue.schedule('enemy-1', 600, callback2);

      expect(queue.size()).toBe(1);
    });
  });

  describe('update', () => {
    it('should not execute task before delay', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);

      queue.update(400);

      expect(callback).not.toHaveBeenCalled();
      expect(queue.size()).toBe(1);
    });

    it('should execute task after delay', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);

      queue.update(500);

      expect(callback).toHaveBeenCalledOnce();
      expect(queue.size()).toBe(0);
    });

    it('should execute task when delay exceeded', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);

      queue.update(600);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should accumulate time across updates', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);

      queue.update(200);
      expect(callback).not.toHaveBeenCalled();

      queue.update(200);
      expect(callback).not.toHaveBeenCalled();

      queue.update(100);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should execute multiple tasks in order', () => {
      const order: string[] = [];
      queue.schedule('enemy-1', 300, () => order.push('1'));
      queue.schedule('enemy-2', 200, () => order.push('2'));
      queue.schedule('enemy-3', 400, () => order.push('3'));

      queue.update(500);

      expect(order).toEqual(['2', '1', '3']);
    });

    it('should handle tasks completing at same time', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      queue.schedule('enemy-1', 500, callback1);
      queue.schedule('enemy-2', 500, callback2);

      queue.update(500);

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
    });
  });

  describe('cancel', () => {
    it('should remove task from queue', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);
      queue.cancel('enemy-1');

      queue.update(600);

      expect(callback).not.toHaveBeenCalled();
      expect(queue.size()).toBe(0);
    });

    it('should handle canceling non-existent task', () => {
      expect(() => queue.cancel('non-existent')).not.toThrow();
    });

    it('should only cancel specified task', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      queue.schedule('enemy-1', 500, callback1);
      queue.schedule('enemy-2', 500, callback2);

      queue.cancel('enemy-1');
      queue.update(600);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledOnce();
    });
  });

  describe('clear', () => {
    it('should remove all tasks', () => {
      queue.schedule('enemy-1', 500, vi.fn());
      queue.schedule('enemy-2', 600, vi.fn());
      queue.schedule('enemy-3', 700, vi.fn());

      queue.clear();

      expect(queue.size()).toBe(0);
    });

    it('should prevent execution of cleared tasks', () => {
      const callback = vi.fn();
      queue.schedule('enemy-1', 500, callback);
      queue.clear();
      queue.update(600);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return true for scheduled task', () => {
      queue.schedule('enemy-1', 500, vi.fn());
      expect(queue.has('enemy-1')).toBe(true);
    });

    it('should return false for non-existent task', () => {
      expect(queue.has('enemy-1')).toBe(false);
    });

    it('should return false after task executes', () => {
      queue.schedule('enemy-1', 100, vi.fn());
      queue.update(200);
      expect(queue.has('enemy-1')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should continue processing if callback throws', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const successCallback = vi.fn();

      queue.schedule('enemy-1', 100, errorCallback);
      queue.schedule('enemy-2', 100, successCallback);

      // Should not throw
      expect(() => queue.update(200)).not.toThrow();
      expect(successCallback).toHaveBeenCalledOnce();
    });
  });
});
