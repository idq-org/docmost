import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';

export const MCP_LIMIT_PER_KEY = 120; // richieste al minuto per chiave
export const MCP_LIMIT_PER_USER = 240; // richieste al minuto per utente (tutte le chiavi)
const WINDOW_SECONDS = 60;

export type RateLimitResult = { allowed: boolean; retryAfter: number };

/**
 * Rate limit a finestra fissa su Redis, per chiave e per utente. Se Redis
 * non risponde la richiesta passa: meglio un limite saltato che l'MCP giù.
 */
@Injectable()
export class IdqMcpRateLimitService {
  private readonly logger = new Logger('IdqMcpRateLimit');

  constructor(private readonly redisService: RedisService) {}

  async check(apiKeyId: string, userId: string): Promise<RateLimitResult> {
    const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const retryAfter =
      WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % WINDOW_SECONDS);
    const keyKey = `idq:mcp:rl:key:${apiKeyId}:${window}`;
    const userKey = `idq:mcp:rl:user:${userId}:${window}`;

    try {
      const redis = this.redisService.getOrThrow();
      const results = await redis
        .multi()
        .incr(keyKey)
        .expire(keyKey, WINDOW_SECONDS + 5)
        .incr(userKey)
        .expire(userKey, WINDOW_SECONDS + 5)
        .exec();

      const keyCount = Number(results?.[0]?.[1] ?? 0);
      const userCount = Number(results?.[2]?.[1] ?? 0);
      const allowed =
        keyCount <= MCP_LIMIT_PER_KEY && userCount <= MCP_LIMIT_PER_USER;
      return { allowed, retryAfter };
    } catch (err) {
      this.logger.warn(`Rate limit check skipped: ${(err as Error).message}`);
      return { allowed: true, retryAfter: 0 };
    }
  }
}
