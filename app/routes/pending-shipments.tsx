import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getPendingShipments } from "~/models/orders.server";
import { useInterval } from "usehooks-ts";
import { DateTime } from "luxon";
import { animated, useSpring } from "@react-spring/web";

/**
 * Shipper wall view — /pending-shipments.
 *
 * Powered by the API's /api/pending-shipments endpoint (ShipStation v1
 * orderStatus=awaiting_shipment). Read-only, auto-refreshes every 60
 * seconds. Card sizing matches list-view.tsx so the two dashboards feel
 * cohesive; auto-scroll pattern borrowed from StatusSection.tsx so the
 * wall cycles through a long list without human intervention.
 *
 * Rows are sorted oldest-sold first — the top of the list is always the
 * highest-priority pick. Once ShipStation flips a row from
 * awaiting_shipment → shipped, the next 60s poll drops it from the wall.
 */

export function links() {
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

/**
 * Force light-mode rendering across all viewers. Wall TV browsers that
 * honor the OS dark-mode preference otherwise auto-invert form chrome
 * + native scrollbars, which makes the whole page hard to read against
 * our light-palette cards. `color-scheme: light` tells the browser the
 * document is designed for a light background and pins UA widgets to
 * match.
 */
export function meta() {
  return [{ name: "color-scheme", content: "light" }];
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
  /**
   * Populated by PendingShipmentsController::enrichWithInventoryStatus.
   * Missing when no matching sales/inventory rows exist for this order
   * (either the marketplace order isn't in our sales table yet, or the
   * order was pushed to ShipStation from a source we don't track).
   */
  inventory_status?: {
    linked: number;
    missing_serial: number;
    imei_expected: number;
    missing_imei: number;
  };
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
 * Aged 30+ days → battery check required before shipping.
 * Lithium-ion cells self-discharge and can hit "puffy / needs-swap"
 * territory sitting sold-but-not-shipped for a month. This flag drives
 * the 🪫 badge on the card so shippers spot it from across the shop
 * floor without reading the sold-at timestamp.
 */
function needsBatteryCheck(iso?: string): boolean {
  return hoursOld(iso) >= 24 * 30;
}

/**
 * "No same-day ship pressure" flag.
 * Sale placed TODAY after 14:00 local (America/New_York) → no same-day
 * requirement. Older sales always need to ship, no matter the time.
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

  // Cookie-based auth gate — same pattern as list-view.tsx.
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

  // Wall-clock ticker.
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useInterval(async () => {
    setIsRefreshing(true);
    try {
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

  // One card per item, matching list-view's per-item card pattern. When
  // an order has multiple items we render N adjacent cards sharing the
  // order #, sold-at chip, ship-to, and total-only-on-first-card.
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

  // Auto-scroll (spring pattern adapted from StatusSection.tsx). If the
  // card grid overflows the visible container, animate y from 0 → -dist
  // over a duration that scales with content length, hold, then animate
  // back. Wheel / touch pauses auto-scroll for 5s so a shipper can nudge
  // the view manually if they need to.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<HTMLDivElement | null>(null);
  const scrollDivRef = useRef<HTMLDivElement | null>(null);
  const [isLargerThanContainer, setIsLargerThanContainer] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const animCfgRef = useRef({ dataHeight: 0, containerHeight: 0 });
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [styles, api] = useSpring(() => ({ y: 0 }));

  // Measure heights whenever cards change (poll → new cards) so we know
  // whether auto-scroll needs to engage. Small delay so the DOM has
  // painted the new content before we sample.
  useEffect(() => {
    if (!containerRef.current || !dataRef.current) return;
    const t = setTimeout(() => {
      if (!containerRef.current || !dataRef.current) return;
      const containerHeight = containerRef.current.offsetHeight;
      const dataHeight = dataRef.current.clientHeight;
      animCfgRef.current = { dataHeight, containerHeight };
      setIsLargerThanContainer(dataHeight > containerHeight);
    }, 100);
    return () => clearTimeout(t);
  }, [cards.length]);

  // Pause auto-scroll for 5s on user wheel / touch interaction.
  useEffect(() => {
    const el = scrollDivRef.current;
    if (!el) return;
    const pause = () => {
      setIsUserScrolling(true);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = setTimeout(() => setIsUserScrolling(false), 5000);
    };
    const onWheel = (e: WheelEvent) => {
      if (!isLargerThanContainer) return;
      e.preventDefault();
      const { dataHeight, containerHeight } = animCfgRef.current;
      const maxScroll = -(dataHeight - containerHeight + 25);
      const currentY = styles.y.get();
      const newY = Math.max(maxScroll, Math.min(0, currentY - e.deltaY));
      api.start({ y: newY, config: { duration: 100 } });
      pause();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", pause);
    el.addEventListener("touchmove", pause);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchmove", pause);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, [api, styles.y, isLargerThanContainer]);

  // Auto-scroll cycle. Fires every 30s; only actually animates when the
  // content overflows AND the user isn't currently interacting.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLargerThanContainer || isUserScrolling) return;
      const { dataHeight, containerHeight } = animCfgRef.current;
      const scrollDistance = dataHeight - containerHeight;
      // Duration formula from StatusSection: 8s base, +1s per 200px of
      // extra content, capped at 20s. Pause 5s between cycles.
      const dur = Math.min(20000, Math.max(8000, 8000 + (scrollDistance / 200) * 1000));
      api.start({ from: { y: 0 }, to: { y: -scrollDistance - 25 }, config: { duration: dur } });
      api.start({
        from: { y: -scrollDistance - 25 },
        to: { y: 0 },
        delay: dur + 5000,
        config: { duration: dur },
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [api, isLargerThanContainer, isUserScrolling]);

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
    <main
      className="relative h-screen overflow-hidden bg-gr-beige-light"
      style={{ colorScheme: "light" }}
    >
      <div className="h-full flex flex-col p-4 pr-24">
        {/* Header — fixed height so the scroll container below owns the rest. */}
        <div className="flex-shrink-0 flex items-baseline justify-between mb-3">
          <h1 className="text-2xl font-bold text-gr-black">Pending Shipments</h1>
          <div className="text-sm text-gr-black/80">
            <span className="font-bold">{cards.length}</span>
            <span className="text-gr-black/60 ml-1">items · {sorted.length} orders</span>
            {totalValue > 0 && (
              <span className="ml-3 font-semibold text-gr-green-dark">
                ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>

        {loadError && (
          <div className="flex-shrink-0 mb-3 border-2 border-red-400 bg-red-50 text-red-800 rounded-lg px-3 py-2 text-sm">
            Couldn't refresh shipments: {loadError}
          </div>
        )}

        {cards.length === 0 && !loadError && (
          <div className="flex-shrink-0 border-2 border-gr-black bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-lg font-bold text-gr-black">You're all caught up.</div>
            <div className="text-sm text-gr-black/70 mt-1">No orders currently awaiting shipment.</div>
          </div>
        )}

        {cards.length > 0 && (
          // Fixed-height scroll host. Auto-scroll animates the inner
          // animated.div's y-transform when contents overflow.
          <div ref={containerRef} className="flex-1 overflow-hidden">
            <div ref={scrollDivRef} className="h-full overflow-hidden">
              <animated.div
                ref={dataRef}
                style={{
                  transform: styles.y.to((y) => `translate3d(0, ${y}px, 0)`),
                }}
              >
                {/* 3-column card grid, matching list-view.tsx sizing so the
                    two dashboards feel like the same product. Compact
                    p-1.5 cards, sm/xs text hierarchy. */}
                <div className="grid grid-cols-3 gap-1.5">
                  {cards.map((c) => {
                    const o = c.order;
                    const hrs = hoursOld(o.orderDate);
                    const post2pm = isPost2pmToday(o.orderDate);
                    const batteryCheck = needsBatteryCheck(o.orderDate);
                    const shipCity = [o.shipTo?.city, o.shipTo?.state].filter(Boolean).join(", ");
                    const customer = o.shipTo?.name ?? o.customerEmail ?? "—";
                    const quantity = c.item.quantity ?? 1;
                    return (
                      <div
                        key={c.key}
                        // Battery-check cards get a heavy amber border + tint so
                        // they read as "handle before shipping" from across the
                        // shop floor. Wins over the post-2pm sky tint (aged
                        // stock is a shipper concern regardless of ship-window).
                        className={`rounded-md p-1.5 border-2 transition-colors ${
                          batteryCheck
                            ? "bg-amber-100 border-amber-500"
                            : post2pm
                              ? "bg-sky-50 border-sky-400"
                              : "bg-white border-gr-black"
                        }`}
                      >
                        {/* Top row: order # + optional item n-of-m + age chip */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-bold text-gray-800">
                              #{o.orderNumber ?? o.orderId}
                            </span>
                            {c.itemCount > 1 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                                {c.itemIndex + 1}/{c.itemCount}
                              </span>
                            )}
                            {batteryCheck && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white border border-amber-700"
                                title="Sold 30+ days ago — battery check required before shipping"
                              >
                                <span className="text-sm leading-none">🪫</span>
                                <span>BATTERY CHECK</span>
                              </span>
                            )}
                            {/* Missing-serial + missing-IMEI badges (Akeem's ask,
                                2026-08-07). Shown per-order (not per-item) — the
                                inventory_status is aggregated across every
                                inventory row linked to this ShipStation order.
                                Duplicates across the order's item cards on
                                purpose so a shipper sees the flag no matter
                                which card they land on. */}
                            {(o.inventory_status?.missing_serial ?? 0) > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white border border-red-800"
                                title={`${o.inventory_status?.missing_serial} of ${o.inventory_status?.linked} linked unit(s) missing a serial number`}
                              >
                                NO SERIAL
                              </span>
                            )}
                            {(o.inventory_status?.missing_imei ?? 0) > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white border border-orange-700"
                                title={`${o.inventory_status?.missing_imei} of ${o.inventory_status?.imei_expected} IMEI-expected unit(s) missing an IMEI`}
                              >
                                NO IMEI
                              </span>
                            )}
                            {post2pm && !batteryCheck && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300"
                                title="Sold after 2 PM local — no same-day ship requirement"
                              >
                                Next-day OK
                              </span>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold border flex-shrink-0 ${ageBadgeClass(hrs)}`}
                            title={o.orderDate ?? ""}
                          >
                            {ageString(o.orderDate)}
                          </span>
                        </div>

                        {/* SKU line — primary "what to pull" — larger than model info */}
                        <div className="mb-0.5">
                          <div className="font-mono text-sm font-bold text-gray-900 leading-tight truncate">
                            {c.item.sku ?? "—"}
                            {quantity > 1 && (
                              <span className="ml-1 text-gr-green-dark">× {quantity}</span>
                            )}
                          </div>
                        </div>

                        {/* Model info under SKU, smaller */}
                        {c.item.name && (
                          <div className="text-xs text-gray-600 mb-1 truncate" title={c.item.name}>
                            {c.item.name}
                          </div>
                        )}

                        {/* Footer: customer + city + total */}
                        <div className="flex items-end justify-between gap-2">
                          <div className="text-xs text-gray-600 min-w-0 flex-1">
                            <div className="truncate font-medium">{customer}</div>
                            {shipCity && (
                              <div className="truncate text-gray-500">{shipCity}</div>
                            )}
                          </div>
                          {o.orderTotal !== undefined && c.itemIndex === 0 && (
                            <div className="text-base font-bold text-green-600 flex-shrink-0">
                              ${Number(o.orderTotal).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </animated.div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar — same treatment as list-view.tsx. */}
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
