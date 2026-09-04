import { ageString, shipStatus, type ShipUrgency } from "~/lib/ship-cutoff";

/**
 * "Does this ship today?" — answered on the card.
 *
 * The boards previously showed elapsed age ("2d 4h") next to a cutoff clock in
 * the page header, leaving the floor to do the arithmetic themselves. Ops asked
 * for the decision, not the inputs: a card should say whether it's going out
 * today. Age is still rendered, but small and secondary — it's for triaging the
 * late pile, not for deciding.
 *
 * Colour carries the same meaning everywhere:
 *   red    = late, already missed a cutoff
 *   green  = committed to ship today
 *   amber  = discretionary 2:00–2:45 window, someone has to decide
 *   slate  = tomorrow, don't spend time on it now
 */
const URGENCY_CLASS: Record<ShipUrgency, string> = {
  late: "bg-red-600 text-white border-red-800",
  today: "bg-emerald-600 text-white border-emerald-800",
  discretionary: "bg-amber-400 text-black border-amber-600",
  tomorrow: "bg-slate-200 text-slate-700 border-slate-400",
  unknown: "bg-slate-100 text-slate-500 border-slate-300",
};

export function ShipBadge({
  orderDate,
  showAge = true,
  className = "",
}: {
  orderDate?: string | null;
  /** Hide the secondary age chip where space is tight. */
  showAge?: boolean;
  className?: string;
}): JSX.Element {
  const status = shipStatus(orderDate);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={status.detail}>
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border leading-none ${URGENCY_CLASS[status.urgency]}`}
      >
        {status.label}
      </span>
      {showAge && status.urgency === "late" && (
        <span className="text-[10px] text-gray-500 font-semibold leading-none">
          {ageString(orderDate)}
        </span>
      )}
    </span>
  );
}

/** Row-level tint so a late order reads across the whole card, not just the pill. */
export function shipRowClass(orderDate?: string | null): string {
  switch (shipStatus(orderDate).urgency) {
    case "late":
      return "bg-red-50 border-red-400";
    case "discretionary":
      return "bg-amber-50 border-amber-400";
    case "tomorrow":
      return "bg-slate-50 border-slate-300";
    default:
      return "";
  }
}
