import { ageString, hoursOld } from "~/lib/ship-cutoff";

/**
 * How long ago the order actually came in.
 *
 * The status wall previously showed only "days in current status", derived from
 * `status_value.created_at`. That resets every time an item is moved, so an
 * order that arrived three days ago but was touched this morning showed as 0 —
 * and since the old badge only rendered above 2 days, it showed nothing at all.
 * Jon's report was "time is wrong, it does not show how long ago the order came
 * in", which was exactly right.
 *
 * This reads `created_at` (the order's real arrival) and always renders, so a
 * fresh order reads "20m" rather than being blank.
 *
 * Kept deliberately separate from ShipBadge: this wall is inbound work in
 * progress, where the 2:00/2:45 shipping cutoffs don't apply. Answering "does
 * this ship today?" on a quote awaiting grading would be nonsense.
 */
function agePillClass(hours: number): string {
  if (hours >= 72) return "bg-red-100 text-red-800";
  if (hours >= 48) return "bg-orange-100 text-orange-800";
  if (hours >= 24) return "bg-yellow-100 text-yellow-800";
  return "bg-gr-mint-100 text-gr-black";
}

export function OrderAgePill({
  createdAt,
  className = "",
}: {
  createdAt?: string | null;
  className?: string;
}): JSX.Element | null {
  if (!createdAt) return null;

  const age = ageString(createdAt);
  const hours = hoursOld(createdAt);

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${agePillClass(hours)} ${className}`}
      title={`Order came in ${age} ago`}
    >
      {age}
    </span>
  );
}
