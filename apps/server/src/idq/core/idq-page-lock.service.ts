import { Injectable } from '@nestjs/common';
import { KeyedMutex } from './keyed-mutex';

/**
 * Serializes changes to the same page made by IDQ features, e.g. two quick
 * moves of a task that replace its status label.
 *
 * The lock lives in this process: enough while the server runs as a single
 * instance, as it does. With more instances this is the one place to switch
 * to a shared lock (e.g. on Redis); a Postgres advisory lock held in a
 * transaction would tie up a pool connection while the work needs others.
 */
@Injectable()
export class IdqPageLock {
  private readonly mutex = new KeyedMutex();

  run<T>(pageId: string, task: () => Promise<T>): Promise<T> {
    return this.mutex.run(pageId, task);
  }
}
