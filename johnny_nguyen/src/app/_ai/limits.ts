const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type LimitReason = 'ip' | 'day';

export interface LimitResult {
  allowed: boolean;
  reason?: LimitReason;
}

export interface LimiterOptions {
  perIpPerHour?: number;
  sitePerDay?: number;
}

/**
 * In-memory counters. On Vercel these reset with every cold start and are not
 * shared between instances, so they are a quota guard rather than a hard gate.
 * The real ceiling is the provider's free-tier limit, which fails to the
 * canned fallback rather than to a charge.
 */
export function createLimiter(options: LimiterOptions = {}) {
  const perIpPerHour = options.perIpPerHour ?? 10;
  const sitePerDay = options.sitePerDay ?? 120;

  const hits = new Map<string, number[]>();
  let dayCount = 0;
  let dayStart = 0;

  return {
    check(ip: string, now: number = Date.now()): LimitResult {
      if (now - dayStart >= DAY_MS) {
        dayStart = now;
        dayCount = 0;
      }
      if (dayCount >= sitePerDay) {
        return { allowed: false, reason: 'day' };
      }

      const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
      if (recent.length >= perIpPerHour) {
        hits.set(ip, recent);
        return { allowed: false, reason: 'ip' };
      }

      recent.push(now);
      hits.set(ip, recent);
      dayCount += 1;

      // Keep the map from growing without bound across a long-lived instance.
      if (hits.size > 500) {
        for (const [key, times] of hits) {
          if (times.every((t) => now - t >= HOUR_MS)) hits.delete(key);
        }
      }

      return { allowed: true };
    },
  };
}

export const limiter = createLimiter();
