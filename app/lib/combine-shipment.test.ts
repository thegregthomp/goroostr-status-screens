// Run: npm run test:unit
import assert from "assert";
// node:test ships with Node 18+ but this repo's @types/node (14) has no
// declaration for it, so type the one function used here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { test } = require("node:test") as { test: (name: string, fn: () => void) => void };
import { historyWeightOz, shipmentSeed, splitLbOz } from "./combine-shipment";

test("single order keeps the old single-order defaults", () => {
  const seed = shipmentSeed([
    {
      weight: { value: 40 },
      carrierCode: "fedex",
      requestedShippingService: "fedex_ground",
      packageCode: "fedex_box",
      shipTo: { residential: false },
      orderTotal: 12500,
    },
  ]);
  assert.deepStrictEqual(seed, {
    weightOz: 40,
    carrierCode: "fedex",
    serviceCode: "fedex_ground",
    packageCode: "fedex_box",
    residential: false,
    orderTotal: 12500,
  });
});

test("combined orders get a summed weight so the rate fetch can run (KAN-746)", () => {
  const seed = shipmentSeed([
    { weight: { value: 24 }, orderTotal: 300 },
    { weight: { value: 18.5 }, carrierCode: "ups", serviceCode: "ups_ground", orderTotal: 450 },
  ]);
  assert.strictEqual(seed.weightOz, 42.5);
  // Primary has no carrier, so carrier + service come from the peer together.
  assert.strictEqual(seed.carrierCode, "ups");
  assert.strictEqual(seed.serviceCode, "ups_ground");
  assert.strictEqual(seed.packageCode, "package");
  assert.strictEqual(seed.residential, true);
  assert.strictEqual(seed.orderTotal, 750);
});

test("a missing order weight leaves the combined weight for ops to enter", () => {
  assert.strictEqual(shipmentSeed([{ weight: { value: 24 } }, {}]).weightOz, null);
  assert.strictEqual(shipmentSeed([]).weightOz, null);
});

test("primary's carrier wins over a peer's", () => {
  const seed = shipmentSeed([
    { carrierCode: "fedex", serviceCode: "fedex_2day" },
    { carrierCode: "ups", serviceCode: "ups_ground" },
  ]);
  assert.strictEqual(seed.carrierCode, "fedex");
  assert.strictEqual(seed.serviceCode, "fedex_2day");
});

test("splitLbOz matches the scale readout", () => {
  assert.deepStrictEqual(splitLbOz(42.5), { lb: "2", oz: "10.5" });
  assert.deepStrictEqual(splitLbOz(12), { lb: "", oz: "12" });
  assert.deepStrictEqual(splitLbOz(32), { lb: "2", oz: "0" });
});

test("history weight counts every unit across the combined orders", () => {
  const weights = {
    A: { median_weight_oz: 20, trusted: true },
    B: { median_weight_oz: 7.25, trusted: true },
  };
  // Same SKU on two orders counts twice; quantity multiplies.
  assert.strictEqual(
    historyWeightOz([{ sku: "A", quantity: 1 }, { sku: "A", quantity: 1 }, { sku: "B", quantity: 2 }], weights),
    54.5
  );
});

test("history weight is null unless every unit's SKU is trusted", () => {
  const weights = {
    A: { median_weight_oz: 20, trusted: true },
    B: { median_weight_oz: 7, trusted: false },
  };
  assert.strictEqual(historyWeightOz([{ sku: "A" }, { sku: "B" }], weights), null);
  assert.strictEqual(historyWeightOz([{ sku: "A" }, { sku: "C" }], weights), null);
  assert.strictEqual(historyWeightOz([{ sku: "A" }, {}], weights), null);
  assert.strictEqual(historyWeightOz([], weights), null);
});
