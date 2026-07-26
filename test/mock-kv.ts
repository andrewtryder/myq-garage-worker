import { vi } from 'vitest';

export function createMockKv(store = new Map<string, string>()) {
  const mockKV = {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    put: vi.fn((key: string, value: string, _options?: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    list: vi.fn(({ prefix, limit }: { prefix?: string; limit?: number } = {}) => {
      let keys = [...store.keys()]
        .filter((key) => (prefix ? key.startsWith(prefix) : true))
        .sort()
        .map((name) => ({ name }));
      if (typeof limit === 'number') {
        keys = keys.slice(0, limit);
      }
      return Promise.resolve({ keys, list_complete: true, cacheStatus: null });
    }),
  };

  return { store, mockKV };
}
