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
 * Two panels stacked vertically:
 *   - Pending (top, 2/3 height)        — awaiting_shipment from ShipStation
 *   - Shipped Today (bottom, 1/3)      — label-generated today (ShipStation
 *                                        flipped it out of awaiting_shipment)
 *
 * Both panels use the same card language + a spring-based auto-scroll (adapted
 * from StatusSection.tsx) so long lists cycle without human intervention.
 *
 * Pending sorts oldest-sold first (highest-priority pick); Shipped Today
 * sorts newest-shipped first (most-recent throughput at the top).
 */

export function links() {
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

/**
 * Force light-mode rendering across all viewers. Wall TV browsers respecting
 * OS dark-mode were auto-inverting scrollbars / native chrome against the
 * light-palette cards. Remix v1 meta shape (object, not v2 array).
 */
export function meta() {
  return {
    "color-scheme": "light",
  };
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
  shipDate?: string;
  orderTotal?: number;
  customerEmail?: string;
  orderSource?: string; // marketplace ("BackMarket", "eBay", "Amazon", "Manual", …)
  requestedShippingService?: string;
  serviceCode?: string;
  advancedOptions?: {
    source?: string;
    storeId?: number;
  };
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
  inventory_status?: {
    linked: number;
    missing_serial: number;
    imei_expected: number;
    missing_imei: number;
  };
};

/** "3h 12m", "2d 4h" — compact age (no trailing "ago" so it fits tighter). */
function ageString(iso?: string): string {
  if (!iso) return "—";
  const then = DateTime.fromISO(iso);
  if (!then.isValid) return "—";
  const diff = DateTime.now().diff(then, ["days", "hours", "minutes"]).toObject();
  const d = Math.floor(diff.days ?? 0);
  const h = Math.floor(diff.hours ?? 0);
  const m = Math.floor(diff.minutes ?? 0);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

function needsBatteryCheck(iso?: string): boolean {
  return hoursOld(iso) >= 24 * 30;
}

function isPost2pmToday(iso?: string): boolean {
  if (!iso) return false;
  const then = DateTime.fromISO(iso).setZone("America/New_York");
  if (!then.isValid) return false;
  const nowLocal = DateTime.now().setZone("America/New_York");
  const sameDay = then.hasSame(nowLocal, "day");
  return sameDay && then.hour >= 14;
}

/**
 * Normalize the marketplace name off orderSource / advancedOptions.source
 * into a short display tag + a color class. Everything unknown falls back to
 * a neutral gray "OTHER" so the wall stays consistent regardless of what
 * ShipStation returns.
 */
/**
 * Marketplace pill sized for TV-distance reading.
 *
 * eBay + BackMarket get custom brand-mark treatments (the eBay 4-color
 * wordmark; BackMarket's chevron + neon lime). Everything else falls
 * back to a colored pill with the brand's primary bg color — good enough
 * for less-common sources without shipping bespoke logos.
 */
function MarketplaceBadge({ order }: { order: PendingShipment }): JSX.Element | null {
  const raw = (order.orderSource ?? order.advancedOptions?.source ?? "").toLowerCase();
  if (!raw) return null;

  // eBay: their iconic 4-color wordmark, per-letter colors on white.
  // Rendered inline so the whole thing scales with card font size and
  // stays crisp on a 40" TV without loading an external SVG.
  if (raw.includes("ebay")) {
    return (
      <span
        className="inline-flex items-baseline px-1.5 py-0.5 rounded-full font-black text-sm bg-white border border-gray-400 leading-none"
        title="eBay"
      >
        <span style={{ color: "#E53238" }}>e</span>
        <span style={{ color: "#0064D2" }}>b</span>
        <span style={{ color: "#F5AF02" }}>a</span>
        <span style={{ color: "#86B817" }}>y</span>
      </span>
    );
  }

  // BackMarket: their neon lime bg + double-chevron mark + black wordmark.
  // Chevron is rendered as a small black rounded rect containing "«",
  // matching the visual weight of their logo lockup at this size.
  if (raw.includes("backmarket")) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold border border-lime-700"
        style={{ backgroundColor: "#E1FA6E", color: "#000" }}
        title="BackMarket"
      >
        <span
          className="inline-flex items-center justify-center rounded-sm px-1 leading-none text-xs font-black"
          style={{ backgroundColor: "#000", color: "#E1FA6E" }}
        >
          «
        </span>
        <span>Back Market</span>
      </span>
    );
  }

  // Fallback path: colored pill + text. Kept simple for less-common
  // marketplaces where a full brand mark isn't worth the code weight.
  const simple = (label: string, className: string) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold border ${className}`}>
      {label}
    </span>
  );
  if (raw.includes("amazon")) return simple("amazon", "bg-black text-orange-400 border-orange-500");
  if (raw.includes("swappa")) return simple("Swappa", "bg-violet-700 text-white border-violet-900");
  if (raw.includes("gazelle")) return simple("Gazelle", "bg-teal-500 text-white border-teal-700");
  if (raw.includes("mercari")) return simple("Mercari", "bg-orange-600 text-white border-orange-800");
  if (raw.includes("shopify")) return simple("Shopify", "bg-lime-500 text-black border-lime-700");
  if (raw.includes("manual")) return simple("Manual", "bg-slate-500 text-white border-slate-700");
  // Custom integration → capitalized name, neutral gray.
  const label = raw.charAt(0).toUpperCase() + raw.slice(1, 12);
  return simple(label, "bg-gray-400 text-white border-gray-600");
}

/**
 * Classify shipping service string into OVERNIGHT / EXPRESS / STANDARD so
 * shippers can decide which box family to grab without reading the full
 * carrier name. Keyword-based; false-positives are safer than missing an
 * urgent overnight, so overnight wins over any other match.
 */
function serviceBadge(o: PendingShipment): { label: string; className: string } | null {
  const raw = (o.requestedShippingService ?? o.serviceCode ?? "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("overnight") || raw.includes("priority_overnight") || raw.includes("next day") || raw.includes("next_day"))
    return { label: "OVERNIGHT", className: "bg-red-600 text-white border-red-800" };
  if (raw.includes("priority mail express") || raw.includes("2day") || raw.includes("2 day") || raw.includes("2-day") || raw.includes("express") || raw.includes("expedited"))
    return { label: "EXPRESS", className: "bg-orange-500 text-white border-orange-700" };
  return { label: "Standard", className: "bg-slate-200 text-slate-800 border-slate-400" };
}

/**
 * Countdown label + urgency for the daily 2:45 PM ship cutoff. Returns
 * `null` after the cutoff so callers can render a "Closed" state.
 */
function shipCutoffState(now: Date): { label: string; className: string } {
  const nowLocal = DateTime.fromJSDate(now).setZone("America/New_York");
  const cutoff = nowLocal.set({ hour: 14, minute: 45, second: 0, millisecond: 0 });
  if (nowLocal >= cutoff) {
    return { label: "CLOSED", className: "text-red-300" };
  }
  const diff = cutoff.diff(nowLocal, ["hours", "minutes", "seconds"]).toObject();
  const h = Math.floor(diff.hours ?? 0);
  const m = Math.floor(diff.minutes ?? 0);
  const s = Math.floor(diff.seconds ?? 0);
  const remainingMin = h * 60 + m;
  const urgent = remainingMin < 30;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m ${s.toString().padStart(2, "0")}s`;
  return { label, className: urgent ? "text-red-300 animate-pulse" : "text-white" };
}

// ─────────────────────────────────────────────────────────────────────────
// Card

type CardEntry = {
  key: string;
  order: PendingShipment;
  item: NonNullable<PendingShipment["items"]>[number];
  itemIndex: number;
  itemCount: number;
};

function flattenToCards(shipments: PendingShipment[]): CardEntry[] {
  const out: CardEntry[] = [];
  for (const o of shipments) {
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
}

/**
 * One shipment/item card. Extracted so Pending + Shipped Today panels
 * render identically. `dim` mutes the card when it's on the Shipped
 * side — visually distinct without being noisy.
 */
function ShipmentCard({ c, dim = false }: { c: CardEntry; dim?: boolean }) {
  const o = c.order;
  const hrs = hoursOld(o.orderDate);
  const post2pm = isPost2pmToday(o.orderDate);
  const batteryCheck = needsBatteryCheck(o.orderDate);
  // MarketplaceBadge returns a full JSX pill (custom for eBay/BackMarket,
  // colored-text fallback for the rest).
  const svc = serviceBadge(o);
  const shipCity = [o.shipTo?.city, o.shipTo?.state].filter(Boolean).join(", ");
  const customer = o.shipTo?.name ?? o.customerEmail ?? "—";
  const quantity = c.item.quantity ?? 1;
  const totalUnits = (o.items ?? []).reduce((s, i) => s + (i.quantity ?? 1), 0);

  const cardBase = dim
    ? "bg-slate-100 border-slate-300 opacity-80"
    : batteryCheck
      ? "bg-amber-100 border-amber-500"
      : post2pm
        ? "bg-sky-50 border-sky-400"
        : "bg-white border-gr-black";

  return (
    <div className={`rounded-md p-1.5 border-2 transition-colors ${cardBase}`}>
      {/* Top row: order # + marketplace/service badges + age chip */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          <span className="text-sm font-bold text-gray-800">
            #{o.orderNumber ?? o.orderId}
          </span>
          <MarketplaceBadge order={o} />
          {svc && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold border ${svc.className}`}>
              {svc.label}
            </span>
          )}
          {c.itemCount > 1 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white border border-purple-800"
              title={`${totalUnits} unit(s) across ${c.itemCount} item type(s) on this order`}
            >
              {totalUnits} ITEMS
            </span>
          )}
          {!dim && batteryCheck && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white border border-amber-700"
              title="Sold 30+ days ago — battery check required before shipping"
            >
              <span className="text-sm leading-none">🪫</span>
              <span>BATTERY CHECK</span>
            </span>
          )}
          {!dim && (o.inventory_status?.missing_serial ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white border border-red-800"
              title={`${o.inventory_status?.missing_serial} of ${o.inventory_status?.linked} linked unit(s) missing a serial number`}
            >
              NO SERIAL
            </span>
          )}
          {!dim && (o.inventory_status?.missing_imei ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white border border-orange-700"
              title={`${o.inventory_status?.missing_imei} of ${o.inventory_status?.imei_expected} IMEI-expected unit(s) missing an IMEI`}
            >
              NO IMEI
            </span>
          )}
          {!dim && post2pm && !batteryCheck && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300"
              title="Sold after 2 PM local — no same-day ship requirement"
            >
              Next-day OK
            </span>
          )}
        </div>
        {/* Age — smaller/muted now that the shippers said it isn't the primary signal. */}
        <span
          className={`inline-flex items-center px-1 py-0 rounded text-[10px] font-semibold border flex-shrink-0 ${ageBadgeClass(hrs)}`}
          title={o.orderDate ?? ""}
        >
          {ageString(o.orderDate)}
        </span>
      </div>

      {/* SKU line — primary "what to pull". Bumped up a notch (base vs sm)
          per the shop-floor readability pass — model info still smaller
          below so hierarchy stays clean. */}
      <div className="mb-0.5">
        <div className="font-mono text-base font-bold text-gray-900 leading-tight truncate">
          {c.item.sku ?? "—"}
          {quantity > 1 && <span className="ml-1 text-gr-green-dark">× {quantity}</span>}
        </div>
      </div>

      {/* Model info under SKU, smaller */}
      {c.item.name && (
        <div className="text-xs text-gray-600 mb-1 truncate" title={c.item.name}>
          {c.item.name}
        </div>
      )}

      {/* Footer: customer + city + STATE prominent + total */}
      <div className="flex items-end justify-between gap-2">
        <div className="text-xs text-gray-600 min-w-0 flex-1">
          <div className="truncate font-medium">{customer}</div>
          {shipCity && <div className="truncate text-gray-500">{shipCity}</div>}
        </div>
        <div className="flex items-end gap-2 flex-shrink-0">
          {o.shipTo?.state && (
            <span className="text-lg font-black text-gr-black leading-none" title={`Ship to ${o.shipTo.state}`}>
              {o.shipTo.state}
            </span>
          )}
          {o.orderTotal !== undefined && c.itemIndex === 0 && (
            <div className="text-base font-bold text-green-600">${Number(o.orderTotal).toFixed(2)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Panel with its own auto-scroll

function ShipmentPanel({
  cards,
  emptyEmoji,
  emptyTitle,
  emptyBody,
  dim = false,
  gridColsClass = "grid-cols-3",
}: {
  cards: CardEntry[];
  emptyEmoji: string;
  emptyTitle: string;
  emptyBody: string;
  dim?: boolean;
  /**
   * Tailwind grid-cols class. Pending panel (wide) uses grid-cols-3;
   * the narrower Shipped side-panel uses grid-cols-1 or grid-cols-2 so
   * each card stays readable at its narrower width. Kept as a class
   * string (not a numeric prop) so tailwind's JIT sees the literal at
   * build time and doesn't purge it.
   */
  gridColsClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<HTMLDivElement | null>(null);
  const scrollDivRef = useRef<HTMLDivElement | null>(null);
  const [isLargerThanContainer, setIsLargerThanContainer] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const animCfgRef = useRef({ dataHeight: 0, containerHeight: 0 });
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [styles, api] = useSpring(() => ({ y: 0 }));

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

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLargerThanContainer || isUserScrolling) return;
      const { dataHeight, containerHeight } = animCfgRef.current;
      const scrollDistance = dataHeight - containerHeight;
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

  if (cards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="border-2 border-gr-black bg-white rounded-2xl p-6 text-center max-w-md">
          <div className="text-4xl mb-2">{emptyEmoji}</div>
          <div className="text-lg font-bold text-gr-black">{emptyTitle}</div>
          <div className="text-sm text-gr-black/70 mt-1">{emptyBody}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden min-h-0">
      <div ref={scrollDivRef} className="h-full overflow-hidden">
        <animated.div
          ref={dataRef}
          style={{ transform: styles.y.to((y) => `translate3d(0, ${y}px, 0)`) }}
        >
          <div className={`grid ${gridColsClass} gap-1.5`}>
            {cards.map((c) => (
              <ShipmentCard key={c.key} c={c} dim={dim} />
            ))}
          </div>
        </animated.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Route

export default function PendingShipments() {
  const initial = useLoaderData<typeof loader>();
  const [shipments, setShipments] = useState<PendingShipment[]>(initial.shipments ?? []);
  const [shippedToday, setShippedToday] = useState<PendingShipment[]>(initial.shipped_today ?? []);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initial.error ?? null);
  const apiEndpoint = initial.apiEndpoint;

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

  // Wall-clock ticker (1s cadence powers the 2:45 PM countdown too).
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
      setShippedToday(data.shipped_today ?? []);
      setLoadError(data.success === false ? data.error ?? "Failed to load" : null);
      setLastUpdated(new Date());
    } catch (e) {
      setLoadError((e as Error).message ?? "Failed to load");
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, 60000);

  // Pending: oldest-sold first (highest priority top).
  const pendingSorted = useMemo(() => {
    return [...shipments].sort((a, b) => {
      const at = a.orderDate ? DateTime.fromISO(a.orderDate).toMillis() : Infinity;
      const bt = b.orderDate ? DateTime.fromISO(b.orderDate).toMillis() : Infinity;
      return at - bt;
    });
  }, [shipments]);

  // Shipped Today: newest-shipped first (most recent throughput on top).
  const shippedSorted = useMemo(() => {
    return [...shippedToday].sort((a, b) => {
      const at = a.shipDate ? DateTime.fromISO(a.shipDate).toMillis() : 0;
      const bt = b.shipDate ? DateTime.fromISO(b.shipDate).toMillis() : 0;
      return bt - at;
    });
  }, [shippedToday]);

  const pendingCards = useMemo(() => flattenToCards(pendingSorted), [pendingSorted]);
  const shippedCards = useMemo(() => flattenToCards(shippedSorted), [shippedSorted]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const cutoff = shipCutoffState(currentTime);

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

  const totalValue = pendingSorted.reduce((s, o) => s + Number(o.orderTotal ?? 0), 0);

  return (
    <main
      className="relative h-screen overflow-hidden bg-gr-beige-light"
      style={{ colorScheme: "light" }}
    >
      <div className="h-full flex flex-col p-4 pr-24 gap-2">
        {loadError && (
          <div className="flex-shrink-0 border-2 border-red-400 bg-red-50 text-red-800 rounded-lg px-3 py-2 text-sm">
            Couldn't refresh shipments: {loadError}
          </div>
        )}

        {/* Side-by-side split: Pending 2/3 (left, main) + Shipped Today
            1/3 (right, muted). Divider between them is a vertical rule
            (was a horizontal one when this was stacked). */}
        <div className="flex-1 flex flex-row min-h-0 gap-3">
          {/* PENDING panel — left 2/3 */}
          <section className="flex flex-col min-h-0" style={{ flex: "2 1 0" }}>
            <div className="flex-shrink-0 flex items-baseline justify-between mb-2">
              <h1 className="text-2xl font-bold text-gr-black">
                Pending
                <span className="ml-3 text-lg font-semibold text-gr-black/70">
                  {pendingCards.length} <span className="text-gr-black/50">items · {pendingSorted.length} orders</span>
                </span>
              </h1>
              {totalValue > 0 && (
                <span className="text-lg font-bold text-gr-green-dark">
                  ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <ShipmentPanel
              cards={pendingCards}
              emptyEmoji="✅"
              emptyTitle="You're all caught up."
              emptyBody="No orders currently awaiting shipment."
              gridColsClass="grid-cols-3"
            />
          </section>

          {/* SHIPPED TODAY panel — right 1/3. Vertical divider (border-l)
              replaces what was the horizontal separator in the stacked
              layout. Grid drops to 1 column at this width so each card
              stays readable. */}
          <section
            className="flex flex-col min-h-0 border-l-2 border-gr-black/30 pl-3"
            style={{ flex: "1 1 0" }}
          >
            <div className="flex-shrink-0 flex items-baseline justify-between mb-2">
              <h2 className="text-xl font-bold text-gr-black/80">
                Shipped Today
                <span className="ml-3 text-base font-semibold text-gr-black/60">
                  {shippedCards.length} <span className="text-gr-black/40">items · {shippedSorted.length} orders</span>
                </span>
              </h2>
            </div>
            <ShipmentPanel
              cards={shippedCards}
              emptyEmoji="📦"
              emptyTitle="Nothing shipped yet today."
              emptyBody="Labels generated today land here as they happen."
              dim
              gridColsClass="grid-cols-1"
            />
          </section>
        </div>
      </div>

      {/* Sidebar */}
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

          {/* 2:45 PM shipping cutoff countdown */}
          <div className="text-center bg-gr-dark-hover rounded-md py-2 px-1">
            <div className="text-[9px] text-gr-beige-light uppercase leading-tight">Ships close</div>
            <div className={`font-black text-lg leading-none mt-1 ${cutoff.className}`}>{cutoff.label}</div>
            <div className="text-[9px] text-gr-beige-light mt-1">2:45 PM</div>
          </div>

          <div className="text-xs space-y-2 text-center">
            <div>
              <div className="text-gr-beige-light text-xs">Updated</div>
              <div className="font-semibold text-xs">{formatTime(lastUpdated)}</div>
            </div>
            <div>
              <div className="text-gr-beige-light text-xs">Pending</div>
              <div className="font-bold text-sm">{pendingSorted.length}</div>
            </div>
            <div>
              <div className="text-gr-beige-light text-xs">Shipped</div>
              <div className="font-bold text-sm">{shippedSorted.length}</div>
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
