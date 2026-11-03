import { authFetch } from "~/lib/auth.client";

// KAN-640: the API refuses a second label (a second postage charge) for an
// order unless the shipper buys it on purpose and says why. Every request is
// one attempt with its own idempotency key, so a retried request replays the
// first label instead of buying again, and a confirmed extra box is a new
// attempt with a new key.

/** The shipper can buy another label on purpose (an extra box) with a reason. */
const EXTRA_BOX_CODES = new Set(["label_already_purchased", "order_already_shipped"]);

export type LabelOverride = { additionalLabel: true; additionalLabelReason: string };

/**
 * A 409 the print endpoints answer instead of buying a label.
 * - extra_box: the order already has a label or is shipped; the UI offers
 *   "Extra box — reason" and resends with `additionalLabel`.
 * - outcome_unknown: the last attempt timed out and may be billed. No retry:
 *   the shipper checks ShipStation first. Only after ticking "there is no
 *   label in ShipStation" can they buy with a reason; that override is also
 *   how the API closes the unresolved attempt (KAN-640).
 * - blocked: another request is buying now; nothing to do but wait.
 */
export type LabelRefusal =
  | { kind: "extra_box"; code: string; message: string; existingTracking: string[] }
  | { kind: "outcome_unknown"; code: string; message: string }
  | { kind: "blocked"; code: string; message: string };

export const EXTRA_BOX_REASON_MIN = 3;

function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** POST one label purchase attempt (fresh idempotency key) and classify a refusal. */
export async function postLabelPurchase(
  url: string,
  body: Record<string, unknown>,
  override?: LabelOverride,
): Promise<{ resp: Response; data: any; refusal: LabelRefusal | null }> {
  const resp = await authFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idempotencyKey: newAttemptKey(), ...(override ?? {}) }),
  });
  const data = await resp.json();
  return { resp, data, refusal: labelRefusal(resp.status, data) };
}

export function labelRefusal(status: number, data: any): LabelRefusal | null {
  if (status !== 409) return null;
  const code = typeof data?.code === "string" ? data.code : "";

  if (EXTRA_BOX_CODES.has(code)) {
    const existingTracking = Array.isArray(data?.existingLabels)
      ? data.existingLabels
          .map((l: any) => l?.trackingNumber)
          .filter((t: unknown): t is string => typeof t === "string" && t !== "")
      : [];
    const message =
      code === "order_already_shipped"
        ? "This order is already shipped in ShipStation, so no label was bought."
        : `This order already has a label${existingTracking.length ? ` (tracking ${existingTracking.join(", ")})` : ""}, so no label was bought.`;
    return { kind: "extra_box", code, message, existingTracking };
  }
  if (code === "label_in_progress") {
    return {
      kind: "blocked",
      code,
      message:
        "A label for this order is being bought right now (another click or station). Don't print again: wait a minute, refresh the list, and check whether it printed.",
    };
  }
  if (code === "label_outcome_unknown") {
    return {
      kind: "outcome_unknown",
      code,
      message:
        "The last label attempt for this order timed out, so ShipStation may already have billed it. Don't print again: check ShipStation > Shipments for this order first. If the label is there, reprint it from ShipStation.",
    };
  }
  return null;
}
