import { KeyedMutex } from './keyed-mutex';

describe('KeyedMutex', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('runs tasks with the same key one at a time, in order', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name} start`);
      await tick();
      events.push(`${name} end`);
      return name;
    };

    const results = await Promise.all([
      mutex.run('page', task('a')),
      mutex.run('page', task('b')),
      mutex.run('other', task('c')),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(events.indexOf('a end')).toBeLessThan(events.indexOf('b start'));
    // Another key doesn't wait.
    expect(events.indexOf('c start')).toBeLessThan(events.indexOf('a end'));
  });

  it('goes on after a failed task', async () => {
    const mutex = new KeyedMutex();
    const failed = mutex.run('page', async () => {
      throw new Error('boom');
    });
    const next = mutex.run('page', async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
