import { json, type LoaderArgs } from "@remix-run/node";
import { getOrders } from "~/models/orders.server";

/**
 * The status board's 10-second refresh. Browsers poll this same-origin route
 * instead of the API so the screen key never leaves the server. Same rule as
 * the page loaders: a registered TV (device cookie) gets the full board, any
 * other browser gets the API's redacted board. The route never adds access
 * the page doesn't already give.
 */
export async function loader({ request }: LoaderArgs) {
  const paginate = new URL(request.url).searchParams.get("paginate") !== "false";
  return json(await getOrders(request, { paginate }), {
    headers: { "Cache-Control": "no-store" },
  });
}
