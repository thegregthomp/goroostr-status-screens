import { authFetch } from "~/lib/auth.client";

// KAN-640: the API refuses a second label (a second postage charge) for an
// order unless the shipper buys it on purpose and says why. Each Print click
// is one attempt with its own key, so a retried attempt replays the first
// label instead of buying again.
const OVERRIDABLE_CODES = new Set([
  "label_already_purchased",
  "label_outcome_unknown",
  "order_already_shipped",
]);

function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * POST a label purchase. On a refusal the shipper can override, ask once for
 * a reason and resend with `additionalLabel`; Cancel leaves the refusal as the
 * result so the caller shows its error.
 */
export async function postLabelPurchase(
  url: string,
  body: Record<string, unknown>,
): Promise<{ resp: Response; data: any }> {
  const idempotencyKey = newAttemptKey();
  const send = async (extra: Record<string, unknown>) => {
    const resp = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, idempotencyKey, ...extra }),
    });
    const data = await resp.json();
    return { resp, data };
  };

  const first = await send({});
  if (first.resp.status !== 409 || !OVERRIDABLE_CODES.has(first.data?.code)) {
    return first;
  }

  const reason = window.prompt(
    `${first.data.error}\n\nAnother label charges postage again. ` +
      "Type why this order needs another label (e.g. second box), or Cancel.",
  );
  if (!reason || reason.trim().length < 3) {
    return first;
  }
  return send({ additionalLabel: true, additionalLabelReason: reason.trim() });
}
