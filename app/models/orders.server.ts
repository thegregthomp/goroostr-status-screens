const goroostrApiRoute = process.env.GOROOSTR_ENDPOINT;

export async function getOrders() {
  // Add paginate=false to get all orders (status screens need everything)
  const response = await fetch(`${goroostrApiRoute}/get-status-orders?paginate=false`);
  return await response.json();
}

/**
 * Outbound orders awaiting shipment — sold on a marketplace / cart but not
 * yet handed to a carrier. Powers the /pending-shipments wall view so the
 * shipping team knows what to pull. Backed by ShipStation v1 orderStatus=
 * awaiting_shipment on the API side (see PendingShipmentsController::index).
 *
 * Response shape: { success, shipments: ShipStationOrder[], total }
 * A ShipStationOrder carries orderNumber, orderDate, customer/shipTo, items[],
 * orderTotal, etc. — see ShipStation v1 /orders response for the full map.
 */
export async function getPendingShipments() {
  // GOROOSTR_ENDPOINT already resolves to the API base (see getOrders which
  // uses /get-status-orders bare — no /api prefix). Don't double it here.
  //
  // KAN-171: the keyed server-to-server route. The public /pending-shipments
  // fallback only exists until STATUS_SCREENS_API_KEY is set; the API locks it.
  const screenKey = process.env.STATUS_SCREENS_API_KEY;
  const response = screenKey
    ? await fetch(`${goroostrApiRoute}/screens/pending-shipments`, {
        headers: { "X-Screen-Key": screenKey, Accept: "application/json" },
      })
    : await fetch(`${goroostrApiRoute}/pending-shipments`);
  if (!response.ok) {
    // Don't blow up the page — surface an empty list + the error so the
    // wall view still renders "0 shipments" instead of a Remix 500.
    return { success: false, shipments: [], total: 0, error: `Upstream ${response.status}` };
  }
  return await response.json();
}