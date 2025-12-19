/**
 * CleanupQueue - Game-loop safe delayed task execution
 *
 * Replaces setTimeout for game logic to avoid:
 * - Race conditions on game restart
 * - Memory leaks from orphaned callbacks
 * - Timing issues with paused games
 */

export interface CleanupTask {
  id: string;
  delay: number;
  elapsed: number;
  callback: () => void;
}

export class CleanupQueue {
  private tasks: Map<string, CleanupTask> = new Map();

  /**
   * Schedule a task to execute after a delay.
   * If a task with the same ID exists, it will be replaced.
   *
   * @param id - Unique identifier for the task
   * @param delay - Delay in milliseconds before execution
   * @param callback - Function to execute
   */
  schedule(id: string, delay: number, callback: () => void): void {
    this.tasks.set(id, {
      id,
      delay,
      elapsed: 0,
      callback,
    });
  }

  /**
   * Update all tasks with elapsed time.
   * Executes and removes tasks that have completed their delay.
   *
   * @param dt - Delta time in milliseconds
   */
  update(dt: number): void {
    const completed: string[] = [];

    // Update elapsed time and collect completed tasks
    for (const [id, task] of this.tasks) {
      task.elapsed += dt;
      if (task.elapsed >= task.delay) {
        completed.push(id);
      }
    }

    // Sort by remaining time (tasks scheduled earlier execute first)
    completed.sort((a, b) => {
      const taskA = this.tasks.get(a)!;
      const taskB = this.tasks.get(b)!;
      return (taskA.delay - taskA.elapsed + dt) - (taskB.delay - taskB.elapsed + dt);
    });

    // Execute and remove completed tasks
    for (const id of completed) {
      const task = this.tasks.get(id);
      if (task) {
        this.tasks.delete(id);
        try {
          task.callback();
        } catch (error) {
          console.error(`CleanupQueue: Error in task "${id}":`, error);
        }
      }
    }
  }

  /**
   * Cancel a scheduled task.
   *
   * @param id - Task identifier to cancel
   */
  cancel(id: string): void {
    this.tasks.delete(id);
  }

  /**
   * Clear all scheduled tasks.
   * Use when resetting game state.
   */
  clear(): void {
    this.tasks.clear();
  }

  /**
   * Check if a task is scheduled.
   *
   * @param id - Task identifier
   */
  has(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * Get number of pending tasks.
   */
  size(): number {
    return this.tasks.size;
  }
}
