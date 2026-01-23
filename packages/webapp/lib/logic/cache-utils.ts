/**
 * Floors a date to the nearest interval (in minutes).
 * Used for bucketing timestamps to cache keys.
 */
export function floorToInterval(date: Date, intervalMinutes: number): Date {
    const ms = date.getTime();
    const intervalMs = intervalMinutes * 60 * 1000;
    return new Date(Math.floor(ms / intervalMs) * intervalMs);
}

const MIN_CACHE_VERSION = "1.1";

/**
 * Checks if a cached status is still valid based on TTL.
 */
export function isCacheValid(cached: any, ttlDays: number = 7): boolean {
    if (!cached || !cached.updated_at) return false;

    // Check version
    if (cached.version !== MIN_CACHE_VERSION) return false;

    const age = Date.now() - new Date(cached.updated_at).getTime();
    const maxAge = ttlDays * 24 * 60 * 60 * 1000;

    return age < maxAge;
}
