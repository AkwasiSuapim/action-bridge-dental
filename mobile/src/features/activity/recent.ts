/**
 * Cases started on this device, per signed-in account. Only case IDs and when they were started
 * are stored (secure storage) — never amounts, plans or treatment details, which are always
 * fetched live. The server has no "list my cases" endpoint yet.
 */
export interface RecentCase {
  caseId: string;
  startedAt: string;
}

export const MAX_RECENT = 10;

/** Secure-store keys allow only letters, digits, ".", "-" and "_". */
export function recentKey(email: string): string {
  return `actionbridge.recent.${email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;
}

export function addRecent(list: RecentCase[], caseId: string, startedAt: string): RecentCase[] {
  return [{ caseId, startedAt }, ...list.filter((item) => item.caseId !== caseId)].slice(0, MAX_RECENT);
}

/** Tolerates missing or corrupted storage: anything unreadable is an empty list. */
export function parseRecent(raw: string | null): RecentCase[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is RecentCase => typeof item?.caseId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item.caseId) && typeof item?.startedAt === 'string')
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}
