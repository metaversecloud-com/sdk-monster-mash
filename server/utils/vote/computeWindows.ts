import { APP_TIMEZONE } from "@shared/content/monsterMash.js";
import { SubmissionWindow } from "@shared/types/index.js";

/**
 * ET wallclock → UTC epoch ms and back. All Monster Mash submission /
 * voting windows anchor to America/New_York regardless of the server's
 * system clock timezone.
 *
 * Epic 1 scope: expose `currentSubmissionWindow(now)` for the key-asset
 * initializer. Epic 6 will add `openNextCycle`, `nextSaturdayEndAtEt`, etc.,
 * reusing the same primitives.
 */

interface EtParts {
  y: number;
  mo: number; // 1..12
  d: number;
  h: number;
  mi: number;
  s: number;
  dow: number; // 0 Sun .. 6 Sat
}

const DOW_LOOKUP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const et = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hour12: false,
});

const etPartsAt = (epochMs: number): EtParts => {
  const parts = et.formatToParts(new Date(epochMs));
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const rawHour = map.get("hour") ?? "0";
  return {
    y: Number(map.get("year")),
    mo: Number(map.get("month")),
    d: Number(map.get("day")),
    h: rawHour === "24" ? 0 : Number(rawHour),
    mi: Number(map.get("minute")),
    s: Number(map.get("second")),
    dow: DOW_LOOKUP[map.get("weekday") ?? "Sun"] ?? 0,
  };
};

/**
 * Convert an ET wallclock (yy/mm/dd hh:mm:ss) into UTC epoch ms.
 * Two passes are enough to converge across DST transitions: after pass 1
 * the guess is within 1 hour of the true instant, so pass 2 lands on it.
 */
const etWallclockToUtc = (y: number, mo: number, d: number, h: number, mi: number, s: number): number => {
  let guess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const wc = etPartsAt(guess);
    const wcAsUtc = Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi, wc.s);
    const targetAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
    guess += targetAsUtc - wcAsUtc;
  }
  return guess;
};

const windowIdFor = (etSundayY: number, etSundayMo: number, etSundayD: number): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${etSundayY}-${pad(etSundayMo)}-${pad(etSundayD)}`;
};

/** Public helper: ET wallclock parts for a given epoch (for logging + display). */
export const etPartsFor = (epochMs: number) => etPartsAt(epochMs);

/** Public helper: is `now` past `endAt` for cycle-close checks. */
export const isPastEnd = (endAt: number, now: number = Date.now()): boolean => now >= endAt;

/**
 * Sun 00:00 ET → Sat 23:59:59 ET containing `now`. `eligibleMonsterIds`
 * always starts empty; monsters are appended by the completion handler.
 */
export const currentSubmissionWindow = (now: number = Date.now()): SubmissionWindow => {
  const nowEt = etPartsAt(now);
  // ET Sunday 00:00 of this week.
  const sundayD = nowEt.d - nowEt.dow;
  const startAt = etWallclockToUtc(nowEt.y, nowEt.mo, sundayD, 0, 0, 0);
  const startEt = etPartsAt(startAt);
  const endAt = etWallclockToUtc(startEt.y, startEt.mo, startEt.d + 6, 23, 59, 59);
  return {
    windowId: windowIdFor(startEt.y, startEt.mo, startEt.d),
    startAt,
    endAt,
    eligibleMonsterIds: [],
  };
};
