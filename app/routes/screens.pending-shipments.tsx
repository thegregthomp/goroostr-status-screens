import { json, type LoaderArgs } from "@remix-run/node";
import { getPendingShipments } from "~/models/orders.server";
import { requireScreenDevice } from "~/lib/screen-device.server";

/**
 * KAN-171 — the TV wall's refresh. The wall polls this same-origin route
 * (its device cookie rides along) instead of calling the API from the TV;
 * this server then fetches from the API with its screen key.
 */
export async function loader({ request }: LoaderArgs) {
  await requireScreenDevice(request);
  return json(await getPendingShipments(), { headers: { "Cache-Control": "no-store" } });
}
