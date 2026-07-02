type CacheRecord<T> = {
  expiresAt: number;
  value: T;
};

type CacheBucket = Record<string, CacheRecord<unknown>>;

const DEFAULT_MAX_ENTRIES = 80;
const memoryCache = new Map<string, CacheRecord<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function hashKey(input: string) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function readBucket(storageKey: string): CacheBucket {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    localStorage.removeItem(storageKey);
    return {};
  }
}

function writeBucket(
  storageKey: string,
  bucket: CacheBucket,
  maxEntries = DEFAULT_MAX_ENTRIES
) {
  const now = Date.now();
  const entries = Object.entries(bucket)
    .filter(([, record]) => record.expiresAt > now)
    .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
    .slice(0, maxEntries);

  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    const reducedEntries = entries.slice(0, Math.max(12, Math.floor(maxEntries / 2)));
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(Object.fromEntries(reducedEntries))
      );
    } catch {
      localStorage.removeItem(storageKey);
    }
  }
}

export async function cachedJson<T>({
  key,
  ttlMs,
  storageKey = "map3d.requestCache",
  maxEntries = DEFAULT_MAX_ENTRIES,
  request,
}: {
  key: string;
  ttlMs: number;
  storageKey?: string;
  maxEntries?: number;
  request: () => Promise<T>;
}): Promise<T> {
  const safeKey = hashKey(key);
  const now = Date.now();
  const memoryRecord = memoryCache.get(safeKey) as CacheRecord<T> | undefined;

  if (memoryRecord && memoryRecord.expiresAt > now) {
    return memoryRecord.value;
  }

  const bucket = readBucket(storageKey);
  const storedRecord = bucket[safeKey] as CacheRecord<T> | undefined;
  if (storedRecord && storedRecord.expiresAt > now) {
    memoryCache.set(safeKey, storedRecord);
    return storedRecord.value;
  }

  if (inflightRequests.has(safeKey)) {
    return inflightRequests.get(safeKey) as Promise<T>;
  }

  const promise = request().then((value) => {
    const record = { expiresAt: Date.now() + ttlMs, value };
    memoryCache.set(safeKey, record);
    bucket[safeKey] = record;
    writeBucket(storageKey, bucket, maxEntries);
    return value;
  });

  inflightRequests.set(safeKey, promise);

  try {
    return await promise;
  } finally {
    inflightRequests.delete(safeKey);
  }
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}
