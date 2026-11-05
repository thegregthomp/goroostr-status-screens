// Run: npm run test:unit
import assert from "assert";
// See combine-shipment.test.ts: @types/node 14 has no node:test declaration.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { test } = require("node:test") as { test: (name: string, fn: () => void) => void };
import { expandUnitSlots, lineUnitCount, remapPicks } from "./unit-slots";

const lotLine = { sku: "LOT-10-CHROMEBOOK", name: "Lot of 10 Chromebooks", quantity: 2 };

test("a quantity line still gives one slot per unit (KAN-64 unchanged)", () => {
  const slots = expandUnitSlots([{ sku: "A", quantity: 3 }, { sku: "B" }]);
  assert.deepStrictEqual(slots.map((s) => [s.sku, s.quantity, s.lineIndex, s.lot]), [
    ["A", 1, 0, false],
    ["A", 1, 0, false],
    ["A", 1, 0, false],
    ["B", 1, 1, false],
  ]);
});

test("two lots of ten give twenty pick slots (KAN-640)", () => {
  // Before: the line quantity (2 lots) was the slot count — 2 slots for 20
  // devices, so the picker could never be completed.
  assert.strictEqual(expandUnitSlots([lotLine]).length, 2);
  const slots = expandUnitSlots([lotLine], { 0: 10 });
  assert.strictEqual(slots.length, 20);
  assert.ok(slots.every((s) => s.lot && s.lineIndex === 0 && s.quantity === 1));
  assert.strictEqual(lineUnitCount(lotLine, 10), 20);
});

test("lot size only applies to its own line; bad input falls back to 1", () => {
  const slots = expandUnitSlots([lotLine, { sku: "CHARGER", quantity: 1 }], { 0: 10 });
  assert.strictEqual(slots.length, 21);
  assert.strictEqual(slots[20].lot, false);
  assert.strictEqual(expandUnitSlots([lotLine], { 0: 0 }).length, 2);
  assert.strictEqual(expandUnitSlots([lotLine], { 0: NaN }).length, 2);
});

test("changing a lot size keeps picks on their units", () => {
  const key = (lots: Record<number, number>) =>
    expandUnitSlots([lotLine, { sku: "CHARGER" }], lots).map((s) => ({ rowKey: "1", lineIndex: s.lineIndex }));
  // Before: 2 lot slots + charger slot (index 2) picked.
  const picks = { 0: "inv-100", 2: "inv-charger" };
  const after = remapPicks(picks, key({}), key({ 0: 10 }));
  // Charger moves from flat index 2 to 20; lot unit 0 stays at 0.
  assert.deepStrictEqual(after, { 0: "inv-100", 20: "inv-charger" });
  // Shrinking drops picks for units that no longer exist.
  const back = remapPicks({ 0: "a", 15: "b", 20: "c" }, key({ 0: 10 }), key({}));
  assert.deepStrictEqual(back, { 0: "a", 2: "c" });
});
