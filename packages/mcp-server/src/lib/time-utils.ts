/**
 * Time bucketing utilities for 5-minute interval alignment.
 */

/**
 * Buckets a timestamp to the nearest 5-minute floor.
 * Examples:
 *   21:37:23 → 21:35:00
 *   21:42:59 → 21:40:00
 *   21:45:00 → 21:45:00 (exact)
 * 
 * @param date - The date to bucket
 * @returns New Date object aligned to 5-minute floor
 */
export function bucketTimestamp(date: Date): Date {
    const ms = date.getTime();
    const bucketMs = 5 * 60 * 1000;  // 5 minutes in milliseconds
    return new Date(Math.floor(ms / bucketMs) * bucketMs);
}

/**
 * Checks if two dates are in the same 5-minute bucket.
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if both dates bucket to the same 5-minute interval
 */
export function isSameBucket(date1: Date, date2: Date): boolean {
    return bucketTimestamp(date1).getTime() === bucketTimestamp(date2).getTime();
}

/**
 * Gets the bucket index offset from a target time.
 * Useful for accessing timeseries arrays.
 * 
 * @param targetTime - The reference time (index 0)
 * @param queryTime - The time to find the index for
 * @returns Index offset (negative = past, 0 = same bucket, positive = future)
 */
export function getBucketIndex(targetTime: Date, queryTime: Date): number {
    const targetBucket = bucketTimestamp(targetTime).getTime();
    const queryBucket = bucketTimestamp(queryTime).getTime();
    const bucketMs = 5 * 60 * 1000;
    return Math.round((queryBucket - targetBucket) / bucketMs);
}
