import React, { useEffect, useMemo, useState } from "react";
import type { LoaderArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getPendingShipments } from "~/models/orders.server";
import { useInterval } from "usehooks-ts";
import { DateTime } from "luxon";

/**
 * Shipper wall view — /pending-shipments.
 *
 * Powered by the API's /api/pending-shipments endpoint, which pulls
 * ShipStation v1 orderStatus=awaiting_shipment orders. Read-only,
 * auto-refreshes every 60 seconds. Optimized for a big-screen display
 * in the warehouse so shippers can see at a glance what to pull and
 * how long each order has been sitting sold-but-not-shipped.
 *
 * Rows are sorted oldest-sold first so the top of the list is always
 * the highest-priority pick.
 */

export function links() {
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

export async function loader({ request }: LoaderArgs) {
  const data = await getPendingShipments();
  return json({
    ...data,
    apiEndpoint: process.env.GOROOSTR_ENDPOINT,
  });
}

/** ShipStation v1 order shape (subset — full shape has ~30 more fields). */
type PendingShipment = {
  orderId?: number;
  orderNumber?: string;
  orderDate?: string;
  orderTotal?: number;
  customerEmail?: string;
  shipTo?: {
    name?: string;
    company?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  items?: Array<{
    sku?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
  }>;
};

/** "3h 12m ago", "2d 4h ago" — compact age display. */
function ageString(iso?: string): string {
  if (!iso) return "—";
  const then = DateTime.fromISO(iso);
  if (!then.isValid) return "—";
  const diff = DateTime.now().diff(then, ["days", "hours", "minutes"]).toObject();
  const d = Math.floor(diff.days ?? 0);
  const h = Math.floor(diff.hours ?? 0);
  const m = Math.floor(diff.minutes ?? 0);
  if (d > 0) return `${d}d ${h}h ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

/** Hours since sold — used to color-code aging (>24h yellow, >48h orange, >72h red). */
function hoursOld(iso?: string): number {
  if (!iso) return 0;
  const then = DateTime.fromISO(iso);
  if (!then.isValid) return 0;
  return DateTime.now().diff(then, "hours").hours;
}

function ageBadgeClass(hours: number): string {
  if (hours >= 72) return "bg-red-100 text-red-800 border-red-300";
  if (hours >= 48) return "bg-orange-100 text-orange-800 border-orange-300";
  if (hours >= 24) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-gr-mint-100 text-gr-black border-gr-black";
}

/**
 * "No same-day ship pressure" flag.
 *
 * Rule: any sale placed TODAY after 14:00 local (America/New_York — the
 * warehouse timezone) doesn't have to ship today, so shippers can safely
 * deprioritize it against the pre-2pm sales. Older sales (any prior day)
 * always need to ship, no matter what time of day they were placed —
 * they never get this flag.
 */
function isPost2pmToday(iso?: string): boolean {
  if (!iso) return false;
  const then = DateTime.fromISO(iso).setZone("America/New_York");
  if (!then.isValid) return false;
  const nowLocal = DateTime.now().setZone("America/New_York");
  const sameDay = then.hasSame(nowLocal, "day");
  return sameDay && then.hour >= 14;
}

export default function PendingShipments() {
  const initial = useLoaderData<typeof loader>();
  const [shipments, setShipments] = useState<PendingShipment[]>(initial.shipments ?? []);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initial.error ?? null);
  const apiEndpoint = initial.apiEndpoint;

  // Reuse the same cookie-based auth gate as the other status-screens views.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("status_auth="));
    if (!cookie) return;
    try {
      const { expires } = JSON.parse(decodeURIComponent(cookie.split("=")[1]));
      if (new Date(expires) > new Date()) setIsAuthenticated(true);
      else document.cookie = "status_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    } catch {
      document.cookie = "status_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "goroostr2024") {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      document.cookie =
        "status_auth=" +
        encodeURIComponent(JSON.stringify({ authenticated: true, expires: expires.toISOString() })) +
        "; expires=" +
        expires.toUTCString() +
        "; path=/;";
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Incorrect password");
      setPassword("");
    }
  };

  // Wall-clock ticker for the sidebar.
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-refresh the shipments list every 60s. Matches the polling
  // cadence of the primary status views; ShipStation's awaiting-shipment
  // set doesn't change fast enough to justify tighter polling.
  useInterval(async () => {
    setIsRefreshing(true);
    try {
      // GOROOSTR_ENDPOINT is already the API base — no /api prefix here.
      const resp = await fetch(`${apiEndpoint}/pending-shipments`);
      const data = await resp.json();
      setShipments(data.shipments ?? []);
      setLoadError(data.success === false ? data.error ?? "Failed to load" : null);
      setLastUpdated(new Date());
    } catch (e) {
      setLoadError((e as Error).message ?? "Failed to load");
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, 60000);

  // Sort oldest-sold first so shippers work top-to-bottom.
  const sorted = useMemo(() => {
    return [...shipments].sort((a, b) => {
      const at = a.orderDate ? DateTime.fromISO(a.orderDate).toMillis() : Infinity;
      const bt = b.orderDate ? DateTime.fromISO(b.orderDate).toMillis() : Infinity;
      return at - bt;
    });
  }, [shipments]);

  // Flatten to one entry per item so each SKU gets its own card, matching
  // the per-item card treatment of the other status-screens views. When
  // an order has multiple items we render N adjacent cards sharing order
  // #, sold-at, ship-to, and total. Preserves oldest-sold-first ordering.
  type CardEntry = {
    key: string;
    order: PendingShipment;
    item: NonNullable<PendingShipment["items"]>[number];
    itemIndex: number;
    itemCount: number;
  };
  const cards: CardEntry[] = useMemo(() => {
    const out: CardEntry[] = [];
    for (const o of sorted) {
      const items = o.items ?? [];
      if (items.length === 0) {
        // Order with no items array — still render one placeholder card
        // so the shipper sees the order sitting there.
        out.push({
          key: `${o.orderId ?? o.orderNumber}-none`,
          order: o,
          item: { sku: "—", name: "(no items on order)", quantity: 1 },
          itemIndex: 0,
          itemCount: 0,
        });
        continue;
      }
      items.forEach((item, i) => {
        out.push({
          key: `${o.orderId ?? o.orderNumber}-${i}-${item.sku ?? "nosku"}`,
          order: o,
          item,
          itemIndex: i,
          itemCount: items.length,
        });
      });
    }
    return out;
  }, [sorted]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gr-beige flex items-center justify-center px-4">
        <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md border-2 border-gr-black">
          <div className="flex justify-center mb-6">
            <img src="/GR_Logo1B.svg" alt="GoRoostr" className="h-12" />
          </div>
          <h2 className="text-xl font-bold text-center text-gr-black mb-6">Pending Shipments</h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-semibold text-gr-black mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gr-black rounded-md focus:outline-none focus:ring-2 focus:ring-gr-green bg-white"
                placeholder="Enter password"
                required
              />
            </div>
            {authError && <div className="mb-4 text-red-600 text-sm">{authError}</div>}
            <button
              type="submit"
              className="w-full bg-gr-green text-gr-black font-bold py-2 px-4 rounded-full border-2 border-gr-black hover:bg-gr-green-hover transition-colors"
            >
              Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalValue = sorted.reduce((s, o) => s + Number(o.orderTotal ?? 0), 0);

  return (
    <main className="relative min-h-screen bg-gr-beige-light">
      <div className="p-6 pr-24">
        <div className="w-full">
          <div className="flex items-baseline justify-between mb-6">
            <h1 className="text-4xl font-bold text-gr-black">Pending Shipments</h1>
            <div className="text-2xl text-gr-black">
              <span className="font-bold">{cards.length}</span>
              <span className="text-gr-black/70 ml-2">items · {sorted.length} orders</span>
              {totalValue > 0 && (
                <span className="ml-4 font-bold text-gr-green-dark">
                  ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
          </div>

          {loadError && (
            <div className="mb-4 border-2 border-red-400 bg-red-50 text-red-800 rounded-lg px-4 py-3 text-xl">
              Couldn't refresh shipments: {loadError}
            </div>
          )}

          {cards.length === 0 && !loadError && (
            <div className="border-2 border-gr-black bg-white rounded-2xl p-16 text-center">
              <div className="text-8xl mb-4">✅</div>
              <div className="text-4xl font-bold text-gr-black">You're all caught up.</div>
              <div className="text-xl text-gr-black/70 mt-3">No orders currently awaiting shipment.</div>
            </div>
          )}

          {cards.length > 0 && (
            // 40" TV target: 2 columns keeps text large enough to read from
            // across the shop floor. Cards are self-contained with the sold-at
            // + order # up top, SKU big and centered, model info smaller
            // beneath, ship-to + total pinned to the bottom.
            <div className="grid grid-cols-2 gap-4">
              {cards.map((c) => {
                const o = c.order;
                const hrs = hoursOld(o.orderDate);
                const post2pm = isPost2pmToday(o.orderDate);
                const shipCity = [o.shipTo?.city, o.shipTo?.state].filter(Boolean).join(", ");
                const customer = o.shipTo?.name ?? o.customerEmail ?? "—";
                const quantity = c.item.quantity ?? 1;
                return (
                  <div
                    key={c.key}
                    // Soft sky tint on the "sold after 2pm today, no ship-today
                    // pressure" cards, plus its own accent border so it reads
                    // as visually distinct at a glance from across the room.
                    className={`rounded-2xl border-2 p-4 ${
                      post2pm
                        ? "bg-sky-50 border-sky-400"
                        : "bg-white border-gr-black"
                    }`}
                  >
                    {/* Header — order # + sold-at + optional multi-item marker */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-gr-black">
                          #{o.orderNumber ?? o.orderId}
                        </span>
                        {c.itemCount > 1 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-base font-semibold bg-gr-beige text-gr-black border border-gr-black">
                            Item {c.itemIndex + 1} of {c.itemCount}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-bold border-2 ${ageBadgeClass(hrs)}`}
                          title={o.orderDate ?? ""}
                        >
                          {ageString(o.orderDate)}
                        </span>
                        {post2pm && (
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-base font-bold bg-sky-100 text-sky-800 border-2 border-sky-400"
                            title="Sold after 2 PM local — no same-day ship requirement"
                          >
                            Next-day OK
                          </span>
                        )}
                      </div>
                    </div>

                    {/* SKU — the primary "what to pull" — biggest on the card */}
                    <div className="mb-3">
                      <div className="font-mono text-3xl font-bold text-gr-black leading-tight">
                        {c.item.sku ?? "—"}
                        {quantity > 1 && (
                          <span className="ml-3 text-2xl text-gr-green-dark">× {quantity}</span>
                        )}
                      </div>
                      {c.item.name && (
                        <div className="text-lg text-gr-black/70 mt-1 leading-snug">
                          {c.item.name}
                        </div>
                      )}
                    </div>

                    {/* Footer — customer + ship-to + total */}
                    <div className="flex items-end justify-between pt-3 border-t border-gr-black/20">
                      <div className="text-xl text-gr-black">
                        <div className="font-semibold">{customer}</div>
                        {(shipCity || o.shipTo?.postalCode) && (
                          <div className="text-lg text-gr-black/70">
                            {shipCity}
                            {o.shipTo?.postalCode && ` · ${o.shipTo.postalCode}`}
                          </div>
                        )}
                      </div>
                      {o.orderTotal !== undefined && c.itemIndex === 0 && (
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-wide text-gr-black/50">Order total</div>
                          <div className="text-2xl font-bold text-gr-green-dark">
                            ${Number(o.orderTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar — same visual treatment as list-view.tsx for cohesion. */}
      <div className="fixed right-0 top-0 bottom-0 w-20 bg-gr-green-dark flex flex-col justify-between p-2 text-white z-40">
        <div className="space-y-2">
          <div className="flex justify-center pt-1 pb-3">
            <div className="bg-gr-beige-light rounded-md px-2 py-1.5 flex items-center justify-center">
              <img src="/GR_Logo1B.svg" alt="GoRoostr" className="h-5" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              {isRefreshing && (
                <svg className="w-2 h-2 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </div>
            <span className="text-xs font-semibold text-gr-green">LIVE</span>
          </div>

          <div className="py-4 border-t border-b border-gr-dark-hover">
            <Link
              to="/"
              className="block p-2 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="Dashboard View"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </Link>
            <Link
              to="/list-view"
              className="block p-2 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="List View"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </Link>
            <div className="p-2 text-white bg-gr-dark-hover rounded mt-1" title="Pending Shipments (Current)">
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8l1-4h12l1 4M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" />
              </svg>
            </div>
          </div>

          <div className="text-xs space-y-2 text-center">
            <div>
              <div className="text-gr-beige-light text-xs">Updated</div>
              <div className="font-semibold text-xs">{formatTime(lastUpdated)}</div>
            </div>
            <div>
              <div className="text-gr-beige-light text-xs">Pending</div>
              <div className="font-bold text-sm">{sorted.length}</div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="text-lg font-bold">
            {currentTime
              .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
              .replace(" AM", "")
              .replace(" PM", "")}
          </div>
        </div>
      </div>
    </main>
  );
}
