// Limite de requisições por janela fixa. Produção: Redis (vale para vários
// processos). Testes: memória.
import { Redis } from 'ioredis';

export interface RateLimitResult { ok: boolean; retryAfterSec: number }

export interface RateLimiter {
  hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
}

export class RedisRateLimiter implements RateLimiter {
  private redis: Redis;
  constructor(url: string) { this.redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false }); }

  async hit(key: string, limit: number, windowSec: number) {
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const k = `rl:${key}:${bucket}`;
    const res = await this.redis.multi().incr(k).expire(k, windowSec + 1).exec();
    if (!res || res[0][0]) throw res?.[0][0] || new Error('falha no Redis');
    const count = Number(res[0][1]);
    const retry = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
    return { ok: count <= limit, retryAfterSec: count <= limit ? 0 : retry };
  }

  ping() { return this.redis.ping(); }
  async close() { await this.redis.quit(); }
}

export class MemoryRateLimiter implements RateLimiter {
  private counts = new Map<string, number>();
  async hit(key: string, limit: number, windowSec: number) {
    const k = `${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = (this.counts.get(k) || 0) + 1;
    this.counts.set(k, n);
    return { ok: n <= limit, retryAfterSec: n <= limit ? 0 : windowSec };
  }
}
