import NodeCache from 'node-cache';

export class CacheService {
  private cache: NodeCache;

  public constructor() {
    this.cache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
  }

  public set<T>(key: string, value: T, ttlSeconds?: string | number) {
    this.cache.set(key, value, ttlSeconds ?? 0);
  }

  public mset(entries: Record<string, unknown>) {
    this.cache.mset(Object.entries(entries).map(([key, value]) => ({ key, val: value })));
  }

  public get<T = unknown>(key: string) {
    return this.cache.get<T>(key);
  }

  public del(key: string) {
    this.cache.del(key);
  }
}
