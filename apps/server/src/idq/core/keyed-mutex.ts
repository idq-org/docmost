/** Runs tasks with the same key one after the other, in this process. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.tails.set(key, current);
    try {
      return await current;
    } finally {
      // Forget the key once nothing else is queued behind this task.
      if (this.tails.get(key) === current) this.tails.delete(key);
    }
  }
}
