/**
 * Pick slots for the shipping wall: one slot per PHYSICAL unit (KAN-64).
 *
 * KAN-640 (Adam 11-05): a lot listing ("lot of 10 Chromebooks") sells as one
 * line whose quantity counts LOTS, so two lots gave two slots for twenty
 * devices — the shipper could not attach every unit and never reached the
 * label step. `unitsPerLot` (per line index) multiplies a line's quantity so
 * each device in each lot gets its own slot.
 */

export type SlotItem = { sku?: string; name?: string; quantity?: number };

export function lineUnitCount(item: SlotItem, unitsPerLot = 1): number {
  const qty = Math.max(1, Math.floor(item.quantity ?? 1));
  const per = Math.max(1, Math.floor(unitsPerLot || 1));
  return qty * per;
}

export function expandUnitSlots<T extends SlotItem>(
  items: T[],
  unitsPerLot: Record<number, number> = {}
): Array<T & { quantity: 1; lineIndex: number; lot: boolean }> {
  const out: Array<T & { quantity: 1; lineIndex: number; lot: boolean }> = [];
  items.forEach((it, lineIndex) => {
    const per = Math.max(1, Math.floor(unitsPerLot[lineIndex] || 1));
    const n = lineUnitCount(it, per);
    for (let i = 0; i < n; i++) {
      out.push({ ...it, quantity: 1, lineIndex, lot: per > 1 });
    }
  });
  return out;
}

/**
 * Keep picks attached to the same unit when a line's lot size changes.
 * Picks are keyed by flat slot index; a slot is identified by
 * (row, line, n-th unit of that line). Units that no longer exist drop.
 */
export function remapPicks<P>(
  picks: Record<number, P>,
  before: Array<{ rowKey: string; lineIndex: number }>,
  after: Array<{ rowKey: string; lineIndex: number }>
): Record<number, P> {
  const id = (s: { rowKey: string; lineIndex: number }, n: number) => `${s.rowKey}|${s.lineIndex}|${n}`;
  const keyed = new Map<string, P>();
  const seen = new Map<string, number>();
  before.forEach((s, i) => {
    const k = `${s.rowKey}|${s.lineIndex}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    if (picks[i] !== undefined) keyed.set(id(s, n), picks[i]);
  });
  const out: Record<number, P> = {};
  seen.clear();
  after.forEach((s, i) => {
    const k = `${s.rowKey}|${s.lineIndex}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const p = keyed.get(id(s, n));
    if (p !== undefined) out[i] = p;
  });
  return out;
}
