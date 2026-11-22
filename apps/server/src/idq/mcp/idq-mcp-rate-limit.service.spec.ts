import {
  IdqMcpRateLimitService,
  MCP_LIMIT_PER_KEY,
  MCP_LIMIT_PER_USER,
} from './idq-mcp-rate-limit.service';

/** The subset of ioredis the service uses, kept in memory. */
class FakeRedis {
  counters = new Map<string, number>();
  expires = new Map<string, number>();

  multi() {
    const ops: (() => [null, number])[] = [];
    const chain = {
      incr: (key: string) => {
        ops.push(() => {
          const value = (this.counters.get(key) ?? 0) + 1;
          this.counters.set(key, value);
          return [null, value];
        });
        return chain;
      },
      expire: (key: string, seconds: number) => {
        ops.push(() => {
          this.expires.set(key, seconds);
          return [null, 1];
        });
        return chain;
      },
      exec: async () => ops.map((op) => op()),
    };
    return chain;
  }
}

function service(redis: unknown) {
  const redisService = {
    getOrThrow: () => {
      if (!redis) throw new Error('Redis is not available');
      return redis;
    },
  };
  return new IdqMcpRateLimitService(redisService as any);
}

describe('IdqMcpRateLimitService', () => {
  // 25 seconds into a one-minute window
  const now = new Date('2026-11-22T10:00:25Z').getTime();

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it(`allows ${MCP_LIMIT_PER_KEY} requests per key per minute, then answers with the seconds left`, async () => {
    const redis = new FakeRedis();
    const limit = service(redis);
    for (let i = 0; i < MCP_LIMIT_PER_KEY; i++) {
      expect((await limit.check('key-1', 'user-1')).allowed).toBe(true);
    }
    const refused = await limit.check('key-1', 'user-1');
    expect(refused).toEqual({ allowed: false, retryAfter: 35 });
    // The counters expire with their window
    for (const seconds of redis.expires.values()) {
      expect(seconds).toBeGreaterThanOrEqual(60);
    }
    // Another key of the same user still has room
    expect((await limit.check('key-2', 'user-1')).allowed).toBe(true);
  });

  it(`allows ${MCP_LIMIT_PER_USER} requests per user per minute, across keys`, async () => {
    const limit = service(new FakeRedis());
    for (let i = 0; i < MCP_LIMIT_PER_USER; i++) {
      const key = i < MCP_LIMIT_PER_USER / 2 ? 'key-a' : 'key-b';
      expect((await limit.check(key, 'user-1')).allowed).toBe(true);
    }
    expect((await limit.check('key-c', 'user-1')).allowed).toBe(false);
    expect((await limit.check('key-d', 'user-2')).allowed).toBe(true);
  });

  it('starts counting again in the next window', async () => {
    const limit = service(new FakeRedis());
    for (let i = 0; i <= MCP_LIMIT_PER_KEY; i++) {
      await limit.check('key-1', 'user-1');
    }
    expect((await limit.check('key-1', 'user-1')).allowed).toBe(false);
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    expect((await limit.check('key-1', 'user-1')).allowed).toBe(true);
  });

  it('lets requests through when Redis is not available', async () => {
    const limit = service(null);
    expect(await limit.check('key-1', 'user-1')).toEqual({
      allowed: true,
      retryAfter: 0,
    });
  });
});
