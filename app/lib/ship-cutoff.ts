import { DateTime } from "luxon";

/**
 * Ship-cutoff rules and ShipStation timestamp handling.
 *
 * Single source of truth. The 2:45 PM cutoff used to be hardcoded separately in
 * list-view.tsx, pending-shipments.tsx and pending-shipments-work.tsx, so
 * changing it meant editing three files and hoping you found them all — and
 * they'd already drifted from how ops actually works.
 *
 * ── The real rule (confirmed with ops 2026-08-24) ──────────────────────────
 * There are TWO boundaries, not one:
 *
 *   before 2:00 PM  → official cutoff. This MUST ship today.
 *   2:00 – 2:45 PM  → discretionary. We CHOOSE whether to ship it today.
 *   after 2:45 PM   → not shipping today.
 *
 * The old code knew only 2:45, which collapsed the discretionary window into
 * "must ship" and left the floor unable to tell a committed order from a
 * judgement call.
 */

/** Everything is New York time — the shop, the cutoffs, the ShipStation account. */
export const SHIP_ZONE = "America/New_York";

/** Official cutoff. Orders in before this must go out today. */
export const CUTOFF_OFFICIAL = { hour: 14, minute: 0 };

/** End of the discretionary window. After this, nothing else ships today. */
export const CUTOFF_DISCRETION_END = { hour: 14, minute: 45 };

/**
 * Parse any timestamp the boards receive, and land it in shop time.
 *
 * Handles BOTH sources correctly, which is why there's one function:
 *
 *  • **ShipStation v1** returns wall-clock time in the ACCOUNT's timezone with
 *    no offset and no Z — e.g. "2026-08-21T11:34:08.0000000". Passing `zone`
 *    tells Luxon to interpret it in that zone. Plain `DateTime.fromISO()` would
 *    instead use whatever zone the VIEWING MACHINE is set to: on the shop-floor
 *    screens that happens to be New York so it looked fine, but the same board
 *    on a laptop set to Pacific shifts every age and same-day flag by 3 hours.
 *
 *  • **Our own API** returns proper UTC — e.g. "2026-08-21T14:20:14.000000Z".
 *    Luxon respects the explicit offset and then CONVERTS into `zone`, so the
 *    instant is right and it displays in shop time.
 *
 * Assumes the ShipStation account is itself set to New York; if that changes,
 * this is the one place to fix.
 */
export function parseShopTime(iso?: string | null): DateTime | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso, { zone: SHIP_ZONE });
  return dt.isValid ? dt : null;
}

/** "now" in shop time. Injectable so tests aren't clock-dependent. */
export function shipNow(now?: DateTime): DateTime {
  return (now ?? DateTime.now()).setZone(SHIP_ZONE);
}

/** Sat/Sun in shop time. Carriers pick up Mon–Fri; the shop doesn't ship on weekends. */
function isWeekend(dt: DateTime): boolean {
  return dt.weekday >= 6;
}

/** Next Mon–Fri after `dt`. Used to roll Friday-post-cutoff and weekend orders to Monday. */
function nextBusinessDay(dt: DateTime): DateTime {
  let d = dt.plus({ days: 1 }).startOf("day");
  while (isWeekend(d)) d = d.plus({ days: 1 });
  return d;
}

/** Business days elapsed strictly after `start` up to and including `end`. Sat/Sun skipped. */
function businessDaysBetween(start: DateTime, end: DateTime): number {
  let count = 0;
  let cur = start.plus({ days: 1 }).startOf("day");
  const endDay = end.startOf("day");
  while (cur <= endDay) {
    if (!isWeekend(cur)) count += 1;
    cur = cur.plus({ days: 1 });
  }
  return count;
}

export type ShipUrgency =
  /** Arrived on an earlier day and still hasn't gone out. */
  | "late"
  /** In before today's official cutoff — committed to ship today. */
  | "today"
  /** Landed in the 2:00–2:45 window — someone has to decide. */
  | "discretionary"
  /** After 2:45 — goes out next business day. */
  | "tomorrow"
  /** No usable order date. */
  | "unknown";

export interface ShipStatus {
  urgency: ShipUrgency;
  /** Short label for the card badge. */
  label: string;
  /** Longer text for a tooltip / title attribute. */
  detail: string;
}

/**
 * Classify one order against the cutoffs.
 *
 * Deliberately answers "does this ship today?" rather than "how old is this?".
 * Age alone forced the floor to do mental arithmetic against a clock in the
 * header, which is the complaint that prompted this.
 */
export function shipStatus(orderDate?: string | null, now?: DateTime): ShipStatus {
  const placed = parseShopTime(orderDate);
  if (!placed) {
    return { urgency: "unknown", label: "—", detail: "No order date available" };
  }

  const nowLocal = shipNow(now);
  const official = nowLocal.set({ ...CUTOFF_OFFICIAL, second: 0, millisecond: 0 });
  const discretionEnd = nowLocal.set({ ...CUTOFF_DISCRETION_END, second: 0, millisecond: 0 });

  // Which business day was this order assigned to when it landed?
  //   • Pre-2 PM on a weekday  → that day.
  //   • After 2 PM, or arrived over a weekend → the next Mon–Fri.
  // Friday-post-cutoff and any Sat/Sun order all roll to Monday for the same
  // reason: nobody's picking it up until then.
  const placedOfficialCutoff = placed.set({ ...CUTOFF_OFFICIAL, second: 0, millisecond: 0 });
  const assignedShipDay = isWeekend(placed) || placed >= placedOfficialCutoff
    ? nextBusinessDay(placed)
    : placed.startOf("day");

  // LATE only when a full business day has passed without shipping. Sat/Sun
  // themselves never fire LATE — a Friday-assigned order that's still here
  // Saturday morning has Monday to be caught. This is the "over the 1-day
  // window" rule ops cares about; missing today's 2:45 cutoff alone is not
  // late, the order simply rolls to tomorrow's window (rendered below).
  if (!isWeekend(nowLocal) && nowLocal.startOf("day") > assignedShipDay) {
    const days = businessDaysBetween(assignedShipDay, nowLocal);
    return {
      urgency: "late",
      label: days === 1 ? "LATE · 1 day" : `LATE · ${days} days`,
      detail: `Placed ${placed.toFormat("ccc h:mm a")} — missed its ${assignedShipDay.toFormat("ccc")} ship window`,
    };
  }

  // Placed later today than "now" shouldn't happen, but a clock skew between
  // ShipStation and us shouldn't produce a scary LATE badge.
  if (placed > nowLocal) {
    return {
      urgency: "today",
      label: "SHIP TODAY",
      detail: `Placed ${placed.toFormat("h:mm a")}`,
    };
  }

  // Weekend, or past today's 2:45, means we've blown today's window. The order
  // rolls to the next business day's window — not late, just no longer today.
  if (isWeekend(nowLocal) || nowLocal >= discretionEnd) {
    const nextShip = nextBusinessDay(nowLocal);
    return {
      urgency: "tomorrow",
      label: "TOMORROW",
      detail: `Placed ${placed.toFormat("ccc h:mm a")} — will ship ${nextShip.toFormat("ccc")}`,
    };
  }

  if (placed < official) {
    return {
      urgency: "today",
      label: "SHIP TODAY",
      detail: `Placed ${placed.toFormat("h:mm a")} — before the 2:00 PM cutoff`,
    };
  }

  if (placed < discretionEnd) {
    return {
      urgency: "discretionary",
      label: "YOUR CALL",
      detail: `Placed ${placed.toFormat("h:mm a")} — after 2:00 PM, we choose whether it ships today`,
    };
  }

  return {
    urgency: "tomorrow",
    label: "TOMORROW",
    detail: `Placed ${placed.toFormat("h:mm a")} — after the 2:45 PM cutoff`,
  };
}

/**
 * Header countdown. Counts to the point where we stop shipping for the day
 * (2:45), not the official cutoff — the floor still has work to do in the
 * discretionary window.
 */
export function shipCutoffCountdown(now?: DateTime): {
  label: string;
  closed: boolean;
  /** Under 30 minutes left — callers pulse it red. */
  urgent: boolean;
} {
  const nowLocal = shipNow(now);
  const end = nowLocal.set({ ...CUTOFF_DISCRETION_END, second: 0, millisecond: 0 });

  if (nowLocal >= end) return { label: "CLOSED", closed: true, urgent: true };

  const diff = end.diff(nowLocal, ["hours", "minutes", "seconds"]).toObject();
  const h = Math.floor(diff.hours ?? 0);
  const m = Math.floor(diff.minutes ?? 0);
  const sec = Math.floor(diff.seconds ?? 0);

  // Seconds only appear inside the final hour — matches what the walls showed
  // before this moved into a shared module; dropping them would read as a
  // frozen clock on a screen people watch.
  const label = h > 0 ? `${h}h ${m}m` : `${m}m ${sec.toString().padStart(2, "0")}s`;

  return { label, closed: false, urgent: h * 60 + m < 30 };
}

/** Compact elapsed age — "3h 12m", "2d 4h". Kept for triage, no longer the headline. */
export function ageString(iso?: string | null, now?: DateTime): string {
  const placed = parseShopTime(iso);
  if (!placed) return "—";

  const diff = shipNow(now).diff(placed, ["days", "hours", "minutes"]).toObject();
  const d = Math.floor(diff.days ?? 0);
  const h = Math.floor(diff.hours ?? 0);
  const m = Math.floor(diff.minutes ?? 0);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Hours elapsed since the order was placed. */
export function hoursOld(iso?: string | null, now?: DateTime): number {
  const placed = parseShopTime(iso);
  if (!placed) return 0;
  return shipNow(now).diff(placed, "hours").hours;
}

/** Sort key — oldest first. Undated rows sink to the bottom. */
export function orderDateMillis(iso?: string | null): number {
  return parseShopTime(iso)?.toMillis() ?? Infinity;
}
