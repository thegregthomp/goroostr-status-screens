/**
 * Seed values for the Print / Combine confirm step (KAN-746).
 *
 * The single-order Print modal seeded weight, carrier, service, package,
 * residential and insurance from the order; Combine skipped that, so the
 * weight stayed blank, the rate fetch never ran and the rate table never
 * appeared. Both flows now seed from this helper: one order gives exactly
 * the old single-order values; several orders going to one address give the
 * values for the one combined parcel.
 */

export type SeedOrder = {
  orderTotal?: number;
  carrierCode?: string;
  serviceCode?: string;
  requestedShippingService?: string;
  packageCode?: string;
  /** ShipStation order weight; the wall treats `value` as ounces. */
  weight?: { value?: number };
  shipTo?: { residential?: boolean };
};

export type ShipmentSeed = {
  /** Total ounces, or null when any order has no weight (ops weighs it). */
  weightOz: number | null;
  carrierCode: string | null;
  serviceCode: string | null;
  packageCode: string;
  residential: boolean;
  /** Sum of order totals — drives the >$10k insurance top-up. */
  orderTotal: number;
};

export function shipmentSeed(orders: SeedOrder[]): ShipmentSeed {
  const primary = orders[0] ?? {};
  // A partial sum would quote a lighter parcel than the box on the scale,
  // so only total the weights when every order has one.
  const weights = orders.map((o) => Number(o.weight?.value) || 0);
  const weightOz =
    orders.length > 0 && weights.every((w) => w > 0)
      ? weights.reduce((a, b) => a + b, 0)
      : null;
  // Carrier + service come from the same order (the primary when it has a
  // carrier) so the pair stays consistent.
  const carrierSource = orders.find((o) => o.carrierCode) ?? primary;
  return {
    weightOz,
    carrierCode: carrierSource.carrierCode ?? null,
    serviceCode: carrierSource.serviceCode ?? carrierSource.requestedShippingService ?? null,
    packageCode: primary.packageCode ?? "package",
    residential: primary.shipTo?.residential ?? true,
    orderTotal: orders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
  };
}

/** Split total ounces into the lb + oz inputs the shop scale reads out. */
export function splitLbOz(totalOz: number): { lb: string; oz: string } {
  const lb = Math.floor(totalOz / 16);
  const oz = totalOz - lb * 16;
  return { lb: lb > 0 ? String(lb) : "", oz: String(oz) };
}

export type SkuWeight = { median_weight_oz?: number; trusted?: boolean };

/**
 * Combined-parcel weight from SKU history: every physical unit's median.
 * Null unless every unit's SKU has trusted history — a partly known weight
 * would under-quote the box.
 */
export function historyWeightOz(
  units: Array<{ sku?: string; quantity?: number }>,
  weights: Record<string, SkuWeight | undefined>
): number | null {
  if (units.length === 0) return null;
  let total = 0;
  for (const u of units) {
    const w = u.sku ? weights[u.sku] : undefined;
    if (!w || !w.trusted || !(Number(w.median_weight_oz) > 0)) return null;
    total += Number(w.median_weight_oz) * Math.max(1, Number(u.quantity) || 1);
  }
  return Math.round(total * 100) / 100;
}
