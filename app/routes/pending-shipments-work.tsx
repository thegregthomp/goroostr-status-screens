import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderArgs } from "@remix-run/node";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getPendingShipments } from "~/models/orders.server";
import { useInterval } from "usehooks-ts";
import { DateTime } from "luxon";
import { authClient, authFetch, AuthRequiredError, type AuthUser } from "~/lib/auth.client";

/**
 * Shipping work view — /pending-shipments-work.
 *
 * Companion to the /pending-shipments wall (40" TV, read-only). This
 * one is for the actual computer where shippers pick, click, and act:
 * dense table, one row per SKU line, search + filter, per-row Print
 * button.
 *
 * Same data source as the wall (getPendingShipments loader), same
 * 60-second polling cadence, same cookie auth gate. Marketplace and
 * service badges duplicated here for now — extract to a shared module
 * once the layout settles.
 */

export function links() {
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

export function meta() {
  return {
    "color-scheme": "light",
    "theme-color": "#ffffff",
  };
}

export async function loader({ request }: LoaderArgs) {
  const data = await getPendingShipments();
  const api = process.env.GOROOSTR_ENDPOINT ?? "";
  // /spa/... base for auth'd endpoints (login, print-*). Derived from
  // the same env var by stripping the trailing /api so we don't need
  // to add a second Netlify env var.
  const spaEndpoint = api.replace(/\/api\/?$/, "") + "/spa";
  return json({
    ...data,
    apiEndpoint: api,
    spaEndpoint,
  });
}

// -----------------------------------------------------------------------
// Types + helpers (duplicated from pending-shipments.tsx; TODO: extract
// to app/components/shipments.tsx once both routes are stable)

type PendingShipment = {
  orderId?: number;
  orderNumber?: string;
  orderDate?: string;
  shipDate?: string;
  orderTotal?: number;
  customerEmail?: string;
  orderSource?: string;
  requestedShippingService?: string;
  serviceCode?: string;
  carrierCode?: string;
  packageCode?: string;
  confirmation?: string;
  // Only present on shipped-today rows (from ShipStation /shipments).
  trackingNumber?: string | null;
  shipmentCost?: number | null;
  weight?: { value?: number; units?: string };
  internalNotes?: string | null;
  advancedOptions?: {
    source?: string;
    storeId?: number;
  };
  shipTo?: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    street3?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    residential?: boolean;
  };
  items?: Array<{
    sku?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
  }>;
};

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

/**
 * Ship-cutoff countdown label — 2:45 PM ET daily. Duplicated from
 * pending-shipments.tsx (each view has its own copy so layouts
 * evolve independently).
 */
function shipCutoffState(now: Date): { label: string; className: string } {
  const nowLocal = DateTime.fromJSDate(now).setZone("America/New_York");
  const cutoff = nowLocal.set({ hour: 14, minute: 45, second: 0, millisecond: 0 });
  if (nowLocal >= cutoff) return { label: "CLOSED", className: "text-red-300" };
  const diff = cutoff.diff(nowLocal, ["hours", "minutes", "seconds"]).toObject();
  const h = Math.floor(diff.hours ?? 0);
  const m = Math.floor(diff.minutes ?? 0);
  const s = Math.floor(diff.seconds ?? 0);
  const urgent = h * 60 + m < 30;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m ${s.toString().padStart(2, "0")}s`;
  return { label, className: urgent ? "text-red-300 animate-pulse" : "text-white" };
}

function ageBadgeClass(hours: number): string {
  if (hours >= 72) return "bg-red-100 text-red-800 border-red-300";
  if (hours >= 48) return "bg-orange-100 text-orange-800 border-orange-300";
  if (hours >= 24) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-gr-mint-100 text-gr-black border-gr-black";
}

function MarketplaceBadge({ order }: { order: PendingShipment }): JSX.Element | null {
  const raw = (order.orderSource ?? order.advancedOptions?.source ?? "").toLowerCase();
  if (!raw) return null;

  if (raw.includes("ebay")) {
    return (
      <span
        className="inline-flex items-baseline px-1.5 py-0.5 rounded-full font-black text-xs bg-black border border-black leading-none"
        title="eBay"
      >
        <span style={{ color: "#E53238" }}>e</span>
        <span style={{ color: "#3199FF" }}>b</span>
        <span style={{ color: "#F5AF02" }}>a</span>
        <span style={{ color: "#86B817" }}>y</span>
      </span>
    );
  }

  if (raw.includes("amazon")) {
    return (
      <span
        className="inline-flex flex-col items-center px-1.5 rounded-md bg-white border border-gray-400 leading-none"
        title="Amazon"
        style={{ paddingTop: 2, paddingBottom: 3 }}
      >
        <span className="font-black text-black text-xs lowercase tracking-tight leading-none">amazon</span>
        <svg viewBox="0 0 44 8" className="w-full" style={{ height: 4, marginTop: 1 }} xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3 Q 22 8 42 3" fill="none" stroke="#FF9900" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M38 1.5 L 42 3 L 40 6" fill="none" stroke="#FF9900" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

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

  const simple = (label: string, className: string) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold border ${className}`}>
      {label}
    </span>
  );
  if (raw.includes("swappa")) return simple("Swappa", "bg-violet-700 text-white border-violet-900");
  if (raw.includes("gazelle")) return simple("Gazelle", "bg-teal-500 text-white border-teal-700");
  if (raw.includes("mercari")) return simple("Mercari", "bg-orange-600 text-white border-orange-800");
  if (raw.includes("shopify")) return simple("Shopify", "bg-lime-500 text-black border-lime-700");
  if (raw.includes("manual")) return simple("Manual", "bg-slate-500 text-white border-slate-700");
  const label = raw.charAt(0).toUpperCase() + raw.slice(1, 12);
  return simple(label, "bg-gray-400 text-white border-gray-600");
}

function serviceBadge(o: PendingShipment): { label: string; className: string } | null {
  const raw = (o.requestedShippingService ?? o.serviceCode ?? "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("overnight") || raw.includes("priority_overnight") || raw.includes("next day") || raw.includes("next_day"))
    return { label: "OVERNIGHT", className: "bg-red-600 text-white border-red-800" };
  if (raw.includes("priority mail express") || raw.includes("2day") || raw.includes("2 day") || raw.includes("2-day") || raw.includes("express") || raw.includes("expedited"))
    return { label: "EXPRESS", className: "bg-orange-500 text-white border-orange-700" };
  return { label: "Standard", className: "bg-slate-200 text-slate-800 border-slate-400" };
}

function StateToken({ state }: { state: string }) {
  const st = state.toUpperCase();
  const outOfConus = st === "HI" || st === "AK";
  const cls = outOfConus ? "bg-red-600 text-white" : "bg-gr-black text-white";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-black tracking-wider ${cls}`}
      title={outOfConus ? `Ship to ${st} — out-of-CONUS, check rate` : `Ship to ${st}`}
    >
      {st}
    </span>
  );
}

// -----------------------------------------------------------------------
// Row model — one row per ORDER (not per line-item). A ShipStation
// order is one label / one shipment, so the "unit of work" for a
// shipper is the order itself. Multi-item orders stack their SKUs in
// the SKU cell and the picker collects one inventory pick per SKU.

type OrderItem = NonNullable<PendingShipment["items"]>[number];

type WorkRow = {
  order: PendingShipment;
  items: OrderItem[];
};

type InventoryMatch = {
  id: number;
  sku: string | null;
  description: string | null;
  serial_number: string | null;
  created_at: string | null;
};

function toRows(shipments: PendingShipment[]): WorkRow[] {
  return shipments
    .filter((o) => (o.items ?? []).length > 0)
    .map((o) => ({ order: o, items: o.items ?? [] }));
}

// -----------------------------------------------------------------------
// Default export

export default function PendingShipmentsWork() {
  const initial = useLoaderData<typeof loader>();
  const [shipments, setShipments] = useState<PendingShipment[]>(initial.shipments ?? []);
  const [shippedToday, setShippedToday] = useState<PendingShipment[]>(initial.shipped_today ?? []);
  // Tab state: Pending (default) vs Shipped Today. Shipped rows are
  // read-only — no Print button, just a listing of what's already
  // shipped with tracking numbers.
  const [tab, setTab] = useState<"pending" | "shipped">("pending");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Wall-clock ticker powers the sidebar's current time display.
  // 1s cadence matches the other views' sidebars for consistency.
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const [loadError, setLoadError] = useState<string | null>(initial.error ?? null);
  const [query, setQuery] = useState("");
  const apiEndpoint = initial.apiEndpoint;
  const spaEndpoint = initial.spaEndpoint;

  // Auth: Sanctum token in localStorage. All postage-billing print
  // calls go through /spa/shipping/* under auth:sanctum so every
  // action attributes to a user (shipping_activity audit log).
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    const t = authClient.getToken();
    const u = authClient.getUser();
    if (!t || !u) {
      navigate("/login?next=/pending-shipments-work", { replace: true });
      return;
    }
    setAuthUser(u);
  }, [navigate]);
  const signOut = () => {
    authClient.clear();
    navigate("/login", { replace: true });
  };
  const handleAuthFailure = (e: unknown) => {
    if (e instanceof AuthRequiredError) {
      navigate("/login?next=/pending-shipments-work", { replace: true });
      return true;
    }
    return false;
  };

  // Auth gate: same 30-day cookie as the wall so a single unlock covers
  // both screens on the same browser.
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

  const sorted = useMemo(() => {
    return [...shipments].sort((a, b) => {
      const at = a.orderDate ? DateTime.fromISO(a.orderDate).toMillis() : Infinity;
      const bt = b.orderDate ? DateTime.fromISO(b.orderDate).toMillis() : Infinity;
      return at - bt;
    });
  }, [shipments]);

  const rows = useMemo(() => toRows(sorted), [sorted]);

  // Shipped-today rows — sorted newest-shipped first so the most
  // recent throughput sits on top.
  const shippedSorted = useMemo(() => {
    return [...shippedToday].sort((a, b) => {
      const at = a.shipDate ? DateTime.fromISO(a.shipDate).toMillis() : 0;
      const bt = b.shipDate ? DateTime.fromISO(b.shipDate).toMillis() : 0;
      return bt - at;
    });
  }, [shippedToday]);

  const shippedRows = useMemo(() => toRows(shippedSorted), [shippedSorted]);

  // Search filter — same predicate applied to whichever tab is active,
  // so the search box works consistently.
  const filterRows = (list: WorkRow[]): WorkRow[] => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const orderNo = (r.order.orderNumber ?? "").toLowerCase();
      const name = (r.order.shipTo?.name ?? r.order.customerEmail ?? "").toLowerCase();
      const city = (r.order.shipTo?.city ?? "").toLowerCase();
      const anySku = r.items.some((it) => (it.sku ?? "").toLowerCase().includes(q));
      const tracking = (r.order.trackingNumber ?? "").toLowerCase();
      return anySku || orderNo.includes(q) || name.includes(q) || city.includes(q) || tracking.includes(q);
    });
  };
  const filtered = useMemo(() => filterRows(rows), [rows, query]);
  const filteredShipped = useMemo(() => filterRows(shippedRows), [shippedRows, query]);

  // KAN-44 Phase C — combine detection. Group pending rows by
  // shipTo signature (name + postalCode, case-insensitive) so a row
  // can advertise "combine with N others" if it has same-address
  // peers. Uses `rows` not `filtered` so a peer hidden by the search
  // filter still counts (avoids "combine with 0" when the peer is
  // filtered out).
  const combineGroups = useMemo(() => {
    const bySig = new Map<string, WorkRow[]>();
    for (const r of rows) {
      const s = r.order.shipTo;
      const sig = ((s?.name ?? "") + "|" + (s?.postalCode ?? "")).toLowerCase().trim();
      if (!sig || sig === "|") continue;
      const list = bySig.get(sig) ?? [];
      list.push(r);
      bySig.set(sig, list);
    }
    return bySig;
  }, [rows]);
  const combinePeersFor = (r: WorkRow): WorkRow[] => {
    const s = r.order.shipTo;
    const sig = ((s?.name ?? "") + "|" + (s?.postalCode ?? "")).toLowerCase().trim();
    const list = combineGroups.get(sig) ?? [];
    return list.filter((x) => x.order.orderId !== r.order.orderId);
  };

  // Print flow state — three stages:
  //   1. picker    — one section per SKU on the order; each collects
  //                  its own inventory pick
  //   2. confirm   — one weight input + all picks summarized
  //   3. result    — success card w/ tracking# + fallback PDF link
  // Kept in the parent so ItemPickerSection sub-components stay
  // stateless-outside-their-own-fetch.
  const [pickerRow, setPickerRow] = useState<WorkRow | null>(null);
  const [picks, setPicks] = useState<Record<number, InventoryMatch>>({});
  const [confirmMode, setConfirmMode] = useState(false);
  // Weight input is TWO fields (lb + oz) because that's how the shop
  // scale reads out ("4 lb 12 oz"). We combine into total ounces on
  // submit — the backend + ShipStation stay ounce-based.
  const [weightLb, setWeightLb] = useState<string>("");
  const [weightOz, setWeightOz] = useState<string>("");
  // Rate-shopping state — all populated when confirmMode flips on.
  // packageCode: what BackMarket 2day one-rate box vs plain "package".
  // dimensions: L×W×H in inches, optional (some carriers need it).
  // residential: shipTo.residential toggle, defaults from order.
  // insuranceAmount: supplemental $ above our $10k external policy.
  // rates: cross-carrier grid populated on load + any change.
  // pickedCarrier/Service: which row the shipper selected.
  const [packageCode, setPackageCode] = useState<string>("package");
  const [packages, setPackages] = useState<Array<{code: string; name: string}>>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [dimL, setDimL] = useState<string>("");
  const [dimW, setDimW] = useState<string>("");
  const [dimH, setDimH] = useState<string>("");
  const [residential, setResidential] = useState<boolean>(true);
  // Signature/confirmation level. ShipStation values:
  //   none | delivery | signature | adult_signature | direct_signature
  const [confirmation, setConfirmation] = useState<string>("none");
  const [insuranceAmount, setInsuranceAmount] = useState<string>("");
  // Insurance provider — carrier (usually cheapest, default in
  // ShipStation UI too) | shipsurance (ShipStation's third-party) |
  // xcover (another third-party option). Only used when
  // insuranceAmount > 0. Was hardcoded to shipsurance before, which
  // caused otherCost to be higher than the ShipStation UI showed
  // for the same shipment.
  const [insuranceProvider, setInsuranceProvider] = useState<string>("carrier");
  // For orders under $10k, insurance is opt-in via this toggle. For
  // orders over $10k the section is always visible and pre-fills the
  // top-up amount (our external policy covers first $10k, they need
  // ShipStation-side coverage for the difference).
  const [insuranceEnabled, setInsuranceEnabled] = useState<boolean>(false);
  // Rules engine — which rules matched this order, for the "auto-
  // applied" badge in the confirm modal. Fetched from
  // /api/shipping/recommended-defaults on confirm-mode open, applied
  // to the confirm-modal state (carrier/service/package/confirmation/
  // residential/insurance) so shipper sees pre-filled values.
  const [matchedRules, setMatchedRules] = useState<Array<{
    id: number; name: string; priority: number;
  }>>([]);
  // Weight-from-history — when the picked SKUs have enough past
  // shipments in sku_weight_averages, we pre-fill the lb/oz inputs
  // with the summed median. This tag drives the "auto-filled" badge
  // in the weight field.
  const [weightHistorySamples, setWeightHistorySamples] = useState<number>(0);
  // Dropdown-per-service UX (2026-08-10 redesign, replacing the full
  // rate table): shipper picks a carrier, then a service, and we
  // fetch a SINGLE rate for that specific pair. Much faster than the
  // old grid which shopped all carriers' rates at once (5s→1-2s).
  const [carriers, setCarriers] = useState<Array<{code: string; name: string}>>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const [services, setServices] = useState<Array<{code: string; name: string}>>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [pickedCarrier, setPickedCarrier] = useState<string | null>(null);
  const [pickedService, setPickedService] = useState<string | null>(null);
  // Rates array — all services for the currently-picked carrier.
  // Middle-ground between the old cross-carrier grid (slow, rate-
  // limit-thrashing) and the pure dropdown (fast but no comparison).
  // ONE ShipStation call per carrier change, all services shown as a
  // click-to-select table.
  const [rates, setRates] = useState<Array<{
    carrierCode: string;
    serviceCode: string;
    serviceName: string;
    shipmentCost: number;
    otherCost: number;
    transitDays: number | null;
    transitDaysEstimated?: boolean;
  }>>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  // Compare-all mode: when true, the rate query drops the
  // `carrierCodes: [pickedCarrier]` restriction so ShipStation returns
  // rates from every whitelisted carrier. Rate table renders a Carrier
  // column, sorts by total cost so cheapest wins visibly. Backend
  // dispatches carriers in parallel + caches 5 min so wall-clock is
  // ~slowest single carrier, not the sum.
  const [compareAllCarriers, setCompareAllCarriers] = useState<boolean>(false);

  // Rate-history hint (2026-08-11) — median postage for the picked
  // SKU + destination state across recent successful ships. Null
  // when there aren't enough samples (<3) OR when we haven't fetched
  // yet. Powers a small "usually ~$X" line under the rate table so
  // ops has a benchmark for whether the current rate is normal.
  const [rateHistory, setRateHistory] = useState<{
    count: number;
    stats: { median: number; min: number; max: number } | null;
  } | null>(null);

  // Buyer's transit expectation derived from the marketplace-requested
  // service or order tags. Powers the recommendation chip — the goal
  // is "cheapest that gets there in time," not "cheapest overall."
  // Overnight/next-day → 1d, 2day/expedited/express → 2d, 3day → 3d,
  // everything else → 5d (standard). Conservative — recommending a
  // slower service than promised is the FE bug that costs a claim,
  // recommending a faster one just costs money we already spend now.
  const maxTransitFor = (order: any): number => {
    const svc = ((order?.requestedShippingService ?? "") + " " + (order?.serviceCode ?? "")).toLowerCase();
    if (/overnight|next[\s_-]?day|1[\s_-]?day/.test(svc)) return 1;
    if (/2[\s_-]?day|expedited|express|priority[\s_-]?overnight/.test(svc)) return 2;
    if (/3[\s_-]?day/.test(svc)) return 3;
    return 5; // standard / ground / home delivery / unknown
  };

  // Recommendation memo — cheapest rate whose transit is at or under
  // the buyer's promise. Null when no rates loaded, or every rate
  // exceeds the tolerance (rare — usually falls back to standard 5d
  // which every ground service meets). Uses `rates` (multi-carrier
  // since we always fetch all whitelisted now).
  const maxTransitDays = pickerRow ? maxTransitFor(pickerRow.order) : 5;
  // USPS (Stamps.com) gets a narrower recommendation window per Greg's
  // rules 2026-08-11: only recommend USPS when the order is under
  // $300, from eBay, AND at least $1 cheaper than the cheapest non-
  // USPS eligible option. Ops can still pick USPS manually from the
  // rate table for out-of-band cases — this only gates auto-recommend.
  const orderTotalForRec = pickerRow?.order?.orderTotal ?? 0;
  const marketplaceForRec = (
    pickerRow?.order?.orderSource ??
    (pickerRow?.order as any)?.advancedOptions?.source ??
    ""
  ).toString().toLowerCase();
  // Address-shape flags used by the USPS gate + the PO Box warning
  // banner. UPS/FedEx can't deliver to PO Boxes or military APO/FPO/
  // DPO, and both surcharge heavily to non-contiguous states — USPS
  // is the right answer there regardless of the normal gates.
  const shipToStreet1ForRec = (pickerRow?.order?.shipTo?.street1 ?? "").toString();
  const shipToStateForRec = (pickerRow?.order?.shipTo?.state ?? "").toString().toUpperCase();
  const isPoBox = /^\s*p\.?\s*o\.?\s*box/i.test(shipToStreet1ForRec);
  const isMilitary =
    /\b(APO|FPO|DPO)\b/i.test(shipToStreet1ForRec) ||
    ["AA", "AE", "AP"].includes(shipToStateForRec);
  const isRemoteState = ["AK", "HI", "PR", "GU", "VI", "AS", "MP"].includes(shipToStateForRec);
  // "USPS-preferred" umbrella — any of the carve-outs where USPS is
  // the right answer regardless of the normal eBay/under-$300 gate.
  const uspsPreferredAddress = isPoBox || isMilitary || isRemoteState;
  // Returns { rate, reasons[] } — the reason strings render on the
  // chip so ops sees WHY this pick, not just what. Null when rates
  // are empty or nothing meets the transit budget.
  const recommendation = useMemo(() => {
    if (rates.length === 0) return null;
    const eligible = rates.filter((r) => {
      if (r.transitDays == null) return false;
      return r.transitDays <= maxTransitDays;
    });
    if (eligible.length === 0) return null;

    const isUsps = (r: typeof eligible[number]) => r.carrierCode === "stamps_com";
    const totalOf = (r: typeof eligible[number]) => r.shipmentCost + r.otherCost;

    const cheapest = eligible.reduce((best, r) =>
      totalOf(r) < totalOf(best) ? r : best
    );
    const nonUspsEligible = eligible.filter((r) => !isUsps(r));
    const cheapestNonUsps = nonUspsEligible.length
      ? nonUspsEligible.reduce((best, r) => (totalOf(r) < totalOf(best) ? r : best))
      : null;

    const reasons: string[] = [];
    reasons.push(`cheapest that meets buyer's ~${maxTransitDays}d promise`);

    let picked = cheapest;
    if (isUsps(cheapest)) {
      // Address-shape carve-outs — USPS wins outright regardless of
      // the normal marketplace/order-total gate:
      //   - PO Box: UPS/FedEx literally can't deliver
      //   - Military APO/FPO/DPO: same, USPS only
      //   - AK/HI/PR/GU/VI/etc: UPS/FedEx surcharge is absurd; USPS
      //     is almost always the right pick here (real case Adam sent
      //     2026-08-12: Buckland AK PO Box quoted UPS Ground at $117
      //     vs USPS Ground Advantage at $40)
      // Regular gate keeps the "eBay + under $300 + $1+ cheaper"
      // constraint so we don't over-recommend USPS on contiguous-US
      // dealer shipments where UPS/FedEx is the shop preference.
      const uspsAllowedByOrder =
        orderTotalForRec > 0 && orderTotalForRec < 300 && marketplaceForRec === "ebay";
      const uspsCheaperByEnough =
        !cheapestNonUsps || totalOf(cheapestNonUsps) - totalOf(cheapest) >= 1.0;

      if (uspsPreferredAddress) {
        // Carve-out — pick USPS + explain why.
        picked = cheapest;
        const label = isPoBox
          ? "PO Box (only USPS delivers)"
          : isMilitary
            ? "APO/FPO/DPO (only USPS delivers)"
            : `${shipToStateForRec} — USPS-preferred remote destination`;
        reasons.push(`USPS OK: ${label}`);
        if (cheapestNonUsps) {
          const diff = totalOf(cheapestNonUsps) - totalOf(cheapest);
          reasons.push(`$${diff.toFixed(2)} cheaper than ${cheapestNonUsps.serviceName || cheapestNonUsps.serviceCode}`);
        }
      } else if (uspsAllowedByOrder && uspsCheaperByEnough) {
        picked = cheapest;
        reasons.push("USPS OK: eBay + under $300");
        if (cheapestNonUsps) {
          const diff = totalOf(cheapestNonUsps) - totalOf(cheapest);
          reasons.push(`$${diff.toFixed(2)} cheaper than ${cheapestNonUsps.serviceName || cheapestNonUsps.serviceCode}`);
        }
      } else if (cheapestNonUsps) {
        // USPS was cheapest but disqualified — fall back + explain.
        picked = cheapestNonUsps;
        const why: string[] = [];
        if (!uspsAllowedByOrder) {
          if (marketplaceForRec !== "ebay") why.push("not eBay");
          if (orderTotalForRec >= 300) why.push("over $300");
        }
        if (!uspsCheaperByEnough) why.push("not $1+ cheaper");
        reasons.push(`skipped USPS (${why.join(", ")})`);
      }
    }

    return { rate: picked, reasons };
  }, [
    rates,
    maxTransitDays,
    orderTotalForRec,
    marketplaceForRec,
    uspsPreferredAddress,
    isPoBox,
    isMilitary,
    shipToStateForRec,
  ]);

  // Back-compat alias — most sites still use `recommendedRate` and
  // treating it as a rate row keeps existing checks (isAlreadyPicked,
  // savings math, apply handler) unchanged.
  const recommendedRate = recommendation?.rate ?? null;

  // Cost of the currently-picked carrier+service (for savings display).
  const pickedTotal = useMemo(() => {
    if (!pickedCarrier || !pickedService) return null;
    const r = rates.find(
      (x) => x.carrierCode === pickedCarrier && x.serviceCode === pickedService
    );
    return r ? r.shipmentCost + r.otherCost : null;
  }, [rates, pickedCarrier, pickedService]);

  const applyRecommendation = () => {
    if (!recommendedRate) return;
    if (recommendedRate.carrierCode) setPickedCarrier(recommendedRate.carrierCode);
    setPickedService(recommendedRate.serviceCode);
  };

  // Auto-apply the recommendation, and RE-apply it if something else
  // clobbers the pick. The rules-engine defaults fetch
  // (/shipping/recommended-defaults) and the rate fetch race — if
  // rates land first, we set picked → recommendation, then rules-engine
  // resolves and setPickedCarrier's back to the marketplace default.
  // Bug repro'd in prod: recommendation chip says UPS but pickedCarrier
  // stuck on FedEx because rules-engine won the race after our
  // one-shot ref bailed out.
  //
  // Instead of a one-shot ref, watch for drift: any time
  // (pickedCarrier, pickedService) doesn't match the recommendation,
  // re-apply — unless ops explicitly clicked a rate row
  // (rateManuallyOverridden), in which case their choice sticks.
  const [rateManuallyOverridden, setRateManuallyOverridden] = useState(false);
  useEffect(() => {
    if (!confirmMode) setRateManuallyOverridden(false);
  }, [confirmMode]);

  // Rate-history fetch — as soon as we know a SKU + shipTo state,
  // pull the median cost for that pair from shipping_activity. Runs
  // once per pickerRow open; result is stable across the session so
  // no need to re-fetch on weight/carrier changes.
  useEffect(() => {
    setRateHistory(null);
    if (!pickerRow) return;
    const sku = pickerRow.items?.[0]?.sku ?? null;
    const state = pickerRow.order?.shipTo?.state ?? null;
    if (!sku) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ sku });
        if (state) qs.set("state", state);
        const resp = await authFetch(`${spaEndpoint}/shipping/sku-cost-history?${qs.toString()}`);
        const data = await resp.json();
        if (cancelled) return;
        if (data.success !== false) {
          setRateHistory({ count: data.count ?? 0, stats: data.stats ?? null });
        }
      } catch {
        /* non-fatal — hint just doesn't render */
      }
    })();
    return () => { cancelled = true; };
  }, [spaEndpoint, pickerRow]);
  useEffect(() => {
    if (!recommendedRate) return;
    if (rateManuallyOverridden) return;
    const matches =
      recommendedRate.carrierCode === pickedCarrier &&
      recommendedRate.serviceCode === pickedService;
    if (matches) return;
    if (recommendedRate.carrierCode) setPickedCarrier(recommendedRate.carrierCode);
    setPickedService(recommendedRate.serviceCode);
  }, [recommendedRate, pickedCarrier, pickedService, rateManuallyOverridden]);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printResult, setPrintResult] = useState<{
    trackingNumber: string | null;
    shipmentCost: number | null;
    carrierCode: string | null;
    serviceCode: string | null;
    labelDataUrl: string | null;
    anomaly?: {
      recommended_cost: number;
      actual_cost: number;
      delta: number;
      multiplier_seen: number;
    } | null;
  } | null>(null);
  // Ref to the label-preview iframe on the success card. Its onLoad
  // handler auto-fires contentWindow.print() inside the modal's own
  // user-gesture chain — more reliable than Chrome's popup-blocker-
  // wary auto-print on a new tab.
  const labelIframeRef = useRef<HTMLIFrameElement | null>(null);

  // KAN-44 Phase A — split shipments state.
  // Each SplitShipment carries its own carrier/service/box/weight/insurance
  // plus the indices of pickerRow.items that belong to it. When splitMode
  // is on, the confirm modal renders one card per shipment and the print
  // button posts to /shipping/print-split. When off, the current single-
  // shipment path is unchanged.
  type SplitShipment = {
    itemIndices: number[]; // indices into pickerRow.items
    weightLb: string;
    weightOz: string;
    packageCode: string;
    pickedCarrier: string | null;
    pickedService: string | null;
    confirmation: string;
    insuranceAmount: string;
    insuranceProvider: string;
  };
  const [splitMode, setSplitMode] = useState(false);
  const [splitShipments, setSplitShipments] = useState<SplitShipment[]>([]);
  // Per-shipment print results — grows as split-print progresses.
  const [splitResults, setSplitResults] = useState<Array<{
    index: number;
    success: boolean;
    trackingNumber?: string | null;
    carrierCode?: string | null;
    labelDataUrl?: string | null;
    error?: string;
  }>>([]);

  const blankSplitShipment = (): SplitShipment => ({
    itemIndices: [],
    weightLb: "",
    weightOz: "",
    packageCode: "package",
    pickedCarrier: pickedCarrier, // seed from single-shipment defaults
    pickedService: pickedService,
    confirmation: "none",
    insuranceAmount: "",
    insuranceProvider: "carrier",
  });

  // Enter split mode: seed with 2 shipments and half the items in each.
  // Shipper immediately sees a workable starting state.
  const enterSplitMode = () => {
    if (!pickerRow) return;
    const n = pickerRow.items.length;
    const half = Math.ceil(n / 2);
    const a = blankSplitShipment();
    const b = blankSplitShipment();
    a.itemIndices = Array.from({ length: half }, (_, i) => i);
    b.itemIndices = Array.from({ length: n - half }, (_, i) => half + i);
    setSplitShipments([a, b]);
    setSplitMode(true);
  };

  const exitSplitMode = () => {
    setSplitMode(false);
    setSplitShipments([]);
    setSplitResults([]);
  };

  // Move an item to a specific shipment (removes from all others). If
  // toShipment === -1, item becomes unallocated. Handles reassignment.
  const assignItemToShipment = (itemIndex: number, toShipment: number) => {
    setSplitShipments((prev) =>
      prev.map((s, i) => ({
        ...s,
        itemIndices:
          i === toShipment
            ? Array.from(new Set([...s.itemIndices, itemIndex])).sort((a, b) => a - b)
            : s.itemIndices.filter((x) => x !== itemIndex),
      }))
    );
  };

  const addSplitShipment = () => {
    setSplitShipments((prev) => [...prev, blankSplitShipment()]);
  };

  const removeSplitShipment = (index: number) => {
    setSplitShipments((prev) => {
      if (prev.length <= 2) return prev; // 2 minimum in split mode
      const removed = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      // Reassign any items from the removed shipment to shipment 0 so
      // they don't silently vanish. Ops can move them again if needed.
      if (removed.itemIndices.length > 0 && rest[0]) {
        rest[0] = {
          ...rest[0],
          itemIndices: Array.from(new Set([...rest[0].itemIndices, ...removed.itemIndices])).sort(
            (a, b) => a - b
          ),
        };
      }
      return rest;
    });
  };

  const updateSplitShipment = (index: number, patch: Partial<SplitShipment>) => {
    setSplitShipments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const openPicker = (row: WorkRow) => {
    setPickerRow(row);
    setPicks({});
    setConfirmMode(false);
    setPrintError(null);
    // Default weight from what ShipStation has on the order (usually
    // populated by automation rules on import). Split whole ounces
    // into lb + oz so both inputs show the split the scale would.
    const totalOz = row.order.weight?.value;
    if (totalOz && totalOz > 0) {
      const lb = Math.floor(totalOz / 16);
      const oz = totalOz - lb * 16;
      setWeightLb(lb > 0 ? String(lb) : "");
      // Preserve fractional oz when present, otherwise show the whole number.
      setWeightOz(Number.isInteger(oz) ? String(oz) : String(oz));
    } else {
      setWeightLb("");
      setWeightOz("");
    }
    // Rate-shopping defaults — seeded from the order.
    setPackageCode(row.order.packageCode ?? "package");
    setDimL("");
    setDimW("");
    setDimH("");
    setResidential(row.order.shipTo?.residential ?? true);
    // Signature defaults to none regardless of what the order was
    // imported with. Shop policy is no-signature by default — even if
    // BackMarket/eBay's automation stamped a signature requirement on
    // the order, the shipper should have to explicitly opt in.
    setConfirmation("none");
    // Insurance behavior depends on order value:
    //   > $10k → auto-enabled, top-up = orderTotal - 10000
    //     (external policy covers first $10k, ShipStation covers rest)
    //   ≤ $10k → opt-in via toggle; blank amount until shipper turns
    //     it on and enters what they want
    const orderTotal = row.order.orderTotal ?? 0;
    const topUp = Math.max(0, Math.floor(orderTotal - 10000));
    if (topUp > 0) {
      setInsuranceAmount(String(topUp));
      setInsuranceEnabled(true);
    } else {
      setInsuranceAmount("");
      setInsuranceEnabled(false);
    }
    setRates([]);
    setRatesError(null);
    setServices([]);
    // Default carrier + service to whatever the order already has —
    // so a "just print with existing settings" flow is one click
    // after the dropdowns populate.
    setPickedCarrier(row.order.carrierCode ?? null);
    setPickedService(row.order.serviceCode ?? row.order.requestedShippingService ?? null);
  };

  const closePicker = () => {
    setPickerRow(null);
    setPicks({});
    setConfirmMode(false);
    setPrintError(null);
    setWeightLb("");
    setWeightOz("");
    setPackageCode("package");
    setPackages([]);
    setPackagesLoading(false);
    setDimL("");
    setDimW("");
    setDimH("");
    setInsuranceAmount("");
    setInsuranceProvider("carrier");
    setInsuranceEnabled(false);
    setConfirmation("none");
    setMatchedRules([]);
    setWeightHistorySamples(0);
    setRates([]);
    setRatesLoading(false);
    setRatesError(null);
    setCarriers([]);
    setCarriersLoading(false);
    setServices([]);
    setServicesLoading(false);
    setPickedCarrier(null);
    setPickedService(null);
  };

  // Rate fetch — fires when the shopper has picked a carrier AND
  // weight is set. Scoped to that ONE carrier via carrierCodes:[X]
  // (no serviceCode restriction) so ShipStation returns ALL services
  // for that carrier in one call. Middle-ground between the old
  // multi-carrier grid (slow, rate-limited) and the pure dropdown
  // (fast but no comparison): user sees every service for the carrier
  // as a table, clicks one to select. Debounced 300ms.
  useEffect(() => {
    // Fires on picker open — NOT gated on confirmMode. The pickerRow
    // → confirmMode gap is 10-30s of ops clicking through the inventory
    // picker, and burning that time to prefetch rates makes the confirm
    // modal feel instant (rate call is the slow one). If ops cancels
    // out of picker before hitting Confirm, we've paid for a rate call
    // + burned some ShipStation rate-limit budget but warmed the cache
    // for the next open.
    if (!pickerRow) return;
    // In compare-all mode we don't need a picked carrier — the query
    // asks for every whitelisted one. In per-carrier mode, no carrier
    // = no rate query.
    // Wait for the carriers list to load before firing. Otherwise the
    // recommendation-driving multi-carrier fetch would race with the
    // /shipping/carriers request and end up sending an empty
    // carrierCodes array (falls back to every ShipStation account
    // carrier including the ones we filter out).
    if (carriers.length === 0) return;
    const totalOz = (Number(weightLb) || 0) * 16 + (Number(weightOz) || 0);
    if (totalOz <= 0) {
      setRates([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setRatesLoading(true);
      setRatesError(null);
      try {
        const dims = (dimL && dimW && dimH)
          ? { length: Number(dimL), width: Number(dimW), height: Number(dimH) }
          : undefined;
        const insurance = Number(insuranceAmount) || 0;
        // Always fetch every whitelisted carrier so the recommendation
        // chip (see recommendedRate memo) has cross-carrier data to
        // pick the cheapest option that meets the buyer's transit
        // promise. The visible rate table filters to `pickedCarrier`
        // when compareAllCarriers is off — same fetch, different view.
        const carrierCodesPayload = {
          carrierCodes: carriers.map((c) => c.code).filter(Boolean),
        };
        const resp = await fetch(`${apiEndpoint}/shipping/rates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: pickerRow.order.orderId,
            weightOz: totalOz,
            packageCode,
            residential,
            // Sending FE's confirmation keeps the rate quote in sync
            // with what will actually print. Without it the backend
            // falls back to the marketplace-imported value, which
            // produces mismatches like "quote shows signature cost
            // but the dropdown says None" (Adam, 2026-08-11).
            confirmation,
            ...carrierCodesPayload,
            ...(dims ? { dimensions: dims } : {}),
            ...(insurance > 0 ? { insuranceAmount: insurance, insuranceProvider } : {}),
          }),
          signal: controller.signal,
        });
        const data = await resp.json();
        if (!resp.ok || data.success === false) {
          throw new Error(data.error ?? `HTTP ${resp.status}`);
        }
        setRates(data.rates ?? []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setRatesError((e as Error).message ?? "Rate lookup failed");
      } finally {
        setRatesLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [apiEndpoint, pickerRow, weightLb, weightOz, packageCode, residential, dimL, dimW, dimH, insuranceAmount, insuranceProvider, confirmation, carriers]);

  // Rules-engine defaults — fetched on picker open (prefetch). Every
  // matching rule's actions get merged into a bundle; we apply each
  // key to the corresponding confirm-modal state so the shipper
  // sees rule-picked values without typing. They can still override
  // any of them by hand — rules just set the initial state.
  useEffect(() => {
    if (!pickerRow || !pickerRow.order.orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${apiEndpoint}/shipping/recommended-defaults/${pickerRow.order.orderId}`
        );
        const data = await resp.json();
        if (cancelled) return;
        const defaults = data.defaults ?? {};
        setMatchedRules(defaults.matchedRules ?? []);
        // Apply each action key. Only set if the rule provided that
        // key — a rule that doesn't mention `confirmation` shouldn't
        // clobber the "None" default.
        if (typeof defaults.carrier === "string") setPickedCarrier(defaults.carrier);
        if (typeof defaults.service === "string") setPickedService(defaults.service);
        if (typeof defaults.package === "string") setPackageCode(defaults.package);
        if (typeof defaults.confirmation === "string") setConfirmation(defaults.confirmation);
        if (typeof defaults.residential === "boolean") setResidential(defaults.residential);
        if (typeof defaults.insurance_provider === "string") setInsuranceProvider(defaults.insurance_provider);
        if (typeof defaults.insurance_amount === "number" && defaults.insurance_amount > 0) {
          setInsuranceAmount(String(defaults.insurance_amount));
          setInsuranceEnabled(true);
        }
      } catch {
        /* non-fatal — confirm modal still works without rule defaults */
      }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, pickerRow]);

  // Weight-from-history — when confirm mode opens, look up each
  // picked SKU's median weight in sku_weight_averages and pre-fill
  // the lb/oz inputs with the summed total. Only fires if all SKUs
  // have "trusted" data (>= MIN_TRUSTED_SAMPLES) so we don't propagate
  // a single-sample outlier. Overwrites whatever the order's own
  // marketplace weight was — SKU-history median is more accurate.
  useEffect(() => {
    // Prefetch on picker open — weight-from-history feeds the rate
    // effect above, so firing this early lets rates start loading
    // before ops even sees the confirm modal.
    if (!pickerRow) return;
    const skus = pickerRow.items
      .map((it) => it.sku)
      .filter(Boolean)
      .join(",");
    if (!skus) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${apiEndpoint}/shipping/sku-weights?skus=${encodeURIComponent(skus)}`
        );
        const data = await resp.json();
        if (cancelled) return;
        const totalOz = Number(data.totalOz) || 0;
        if (totalOz > 0) {
          const lb = Math.floor(totalOz / 16);
          const oz = Math.round((totalOz - lb * 16) * 100) / 100;
          setWeightLb(lb > 0 ? String(lb) : "");
          setWeightOz(oz > 0 ? String(oz) : "");
          // Sum sample counts across the picked SKUs for the badge —
          // more samples = more confidence.
          const samples = Object.values(data.weights ?? {}).reduce(
            (acc: number, w: any) => acc + (w?.sample_count ?? 0),
            0
          ) as number;
          setWeightHistorySamples(samples);
        }
      } catch {
        /* non-fatal — falls back to order's default weight */
      }
    })();
    return () => { cancelled = true; };
    // Re-runs when picks change (items[] changes shape only if the
    // shipper re-picks, which happens back in Stage 1 not confirm).
  }, [apiEndpoint, pickerRow]);

  // Fetch the account's configured carriers on picker open (prefetch
  // — the rate effect gates on carriers.length, so firing this early
  // unblocks rates during picker stage).
  useEffect(() => {
    if (!pickerRow) return;
    let cancelled = false;
    setCarriersLoading(true);
    (async () => {
      try {
        const resp = await fetch(`${apiEndpoint}/shipping/carriers`);
        const data = await resp.json();
        if (cancelled) return;
        if (data.success !== false) {
          setCarriers(data.carriers ?? []);
        }
      } catch {
        /* non-fatal — dropdown just stays with the seeded value */
      } finally {
        if (!cancelled) setCarriersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, pickerRow]);

  // Fetch services for the currently-picked carrier so the service
  // dropdown offers real per-account options (not hardcoded).
  useEffect(() => {
    if (!confirmMode || !pickedCarrier) return;
    let cancelled = false;
    setServicesLoading(true);
    (async () => {
      try {
        const resp = await fetch(`${apiEndpoint}/shipping/carriers/${encodeURIComponent(pickedCarrier)}/services`);
        const data = await resp.json();
        if (cancelled) return;
        if (data.success !== false) {
          setServices(data.services ?? []);
        }
      } catch {
        /* non-fatal — dropdown just falls back to whatever's seeded */
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, confirmMode, pickedCarrier]);

  // Fetch packages for the currently-picked carrier so the package
  // dropdown offers the right options (Fedex has "fedex_one_rate_*",
  // USPS has flat-rate boxes, etc.). Falls back to a bare "package"
  // if the fetch fails.
  useEffect(() => {
    if (!confirmMode || !pickedCarrier) return;
    let cancelled = false;
    setPackagesLoading(true);
    (async () => {
      try {
        const resp = await fetch(`${apiEndpoint}/shipping/carriers/${encodeURIComponent(pickedCarrier)}/packages`);
        const data = await resp.json();
        if (cancelled) return;
        if (data.success !== false) {
          setPackages(data.packages ?? []);
        }
      } catch {
        // Non-fatal — user can still ship with the default "package".
      } finally {
        if (!cancelled) setPackagesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, confirmMode, pickedCarrier]);

  const setPickForItem = (itemIndex: number, inv: InventoryMatch) =>
    setPicks((prev) => ({ ...prev, [itemIndex]: inv }));
  const unsetPickForItem = (itemIndex: number) =>
    setPicks((prev) => {
      const next = { ...prev };
      delete next[itemIndex];
      return next;
    });

  const allPicked = pickerRow
    ? pickerRow.items.every((_, i) => picks[i] !== undefined)
    : false;

  const goToConfirm = () => {
    if (!allPicked) return;
    setConfirmMode(true);
    setPrintError(null);
  };
  const backToPick = () => {
    setConfirmMode(false);
    setPrintError(null);
  };

  // Combine the lb + oz fields into total ounces for the API. Falls
  // back to 0 for empty/NaN parts so "4lb" alone works ("0oz").
  const totalOunces = (): number => {
    const lb = Number(weightLb) || 0;
    const oz = Number(weightOz) || 0;
    return lb * 16 + oz;
  };

  const firePrint = async () => {
    if (!pickerRow) return;
    const inventoryIds = pickerRow.items.map((_, i) => picks[i]?.id).filter(Boolean) as number[];
    if (inventoryIds.length !== pickerRow.items.length) {
      setPrintError("One or more items don't have an inventory pick.");
      return;
    }
    const w = totalOunces();
    if (w <= 0) {
      setPrintError("Enter a weight (lb and/or oz) before printing.");
      return;
    }
    setPrinting(true);
    setPrintError(null);
    try {
      // Dimensions only get sent when all three are filled — some
      // carriers require them, others reject partial dims. Insurance
      // top-up only when set (we don't want a `0` to disable existing
      // ShipStation-side insurance if any).
      const dims = (dimL && dimW && dimH)
        ? { length: Number(dimL), width: Number(dimW), height: Number(dimH) }
        : undefined;
      const insurance = Number(insuranceAmount) || 0;

      // Recommended cost at the moment ops hit Print — backend uses
      // it for the cost-anomaly Slack alert. Send even if ops picked
      // something different from the rec; the compare is
      // actual vs recommendation, not vs picked.
      const recCost = recommendedRate
        ? recommendedRate.shipmentCost + recommendedRate.otherCost
        : null;

      const resp = await authFetch(`${spaEndpoint}/shipping/print-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: pickerRow.order.orderId,
          inventoryIds,
          weightOz: w,
          ...(pickedCarrier ? { carrierCode: pickedCarrier } : {}),
          ...(pickedService ? { serviceCode: pickedService } : {}),
          packageCode,
          residential,
          confirmation,
          ...(dims ? { dimensions: dims } : {}),
          ...(insurance > 0 ? { insuranceAmount: insurance, insuranceProvider } : {}),
          ...(recCost !== null && recCost > 0 ? { recommendedRateCost: recCost } : {}),
          ...(pickerRow.order.shipTo?.state
            ? { destState: pickerRow.order.shipTo.state }
            : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      let labelDataUrl: string | null = null;
      if (data.labelData) {
        const binary = atob(data.labelData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        labelDataUrl = URL.createObjectURL(blob);

        // Was previously window.open() + printWin.print() — but
        // modern Chrome throttles auto-triggered print() on newly-
        // opened tabs (needs a fresh user gesture in the target tab
        // to actually fire the dialog). Result: shipper still had to
        // manually click Print in the new tab.
        //
        // Instead we embed the PDF in a hidden iframe on the success
        // card JSX below. The iframe lives inside the modal's own
        // user-gesture chain, so calling iframe.contentWindow.print()
        // on its load event actually fires the dialog. See the
        // ref-driven auto-print effect + manual "Print again" button
        // on the success card for the plumbing.
      }
      setPrintResult({
        trackingNumber: data.trackingNumber ?? null,
        shipmentCost: data.shipmentCost ?? null,
        carrierCode: data.carrierCode ?? null,
        serviceCode: data.serviceCode ?? null,
        labelDataUrl,
        anomaly: data.anomaly ?? null,
      });
      // Drop the pending row from the list optimistically (60s poll
      // would catch up anyway, but this feels responsive).
      setShipments((prev) => prev.filter((s) => s.orderId !== pickerRow.order.orderId));
    } catch (e) {
      if (handleAuthFailure(e)) return; setPrintError((e as Error).message ?? "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  const closePrintResult = () => {
    if (printResult?.labelDataUrl) URL.revokeObjectURL(printResult.labelDataUrl);
    setPrintResult(null);
    closePicker();
  };

  // KAN-44 Phase A — split-print handler. Validates every shipment
  // has at least 1 item + a weight + a carrier/service, then posts
  // once to /shipping/print-split. The backend prints sequentially
  // and returns a per-shipment result array; we render it into the
  // splitResults state (with one label preview per success).
  const fireSplitPrint = async () => {
    if (!pickerRow) return;
    setPrintError(null);

    // Client-side validation — every item must be allocated to
    // exactly one shipment; every shipment needs its own carrier +
    // service + weight.
    const totalItems = pickerRow.items.length;
    const assigned = new Set<number>();
    for (const s of splitShipments) for (const i of s.itemIndices) assigned.add(i);
    if (assigned.size !== totalItems) {
      setPrintError(`Every item must be assigned to a shipment. ${totalItems - assigned.size} unassigned.`);
      return;
    }
    for (let i = 0; i < splitShipments.length; i++) {
      const s = splitShipments[i];
      if (s.itemIndices.length === 0) {
        setPrintError(`Shipment ${i + 1} has no items — remove it or move items into it.`);
        return;
      }
      const wOz = (Number(s.weightLb) || 0) * 16 + (Number(s.weightOz) || 0);
      if (wOz <= 0) {
        setPrintError(`Shipment ${i + 1}: enter a weight (lb and/or oz).`);
        return;
      }
      if (!s.pickedCarrier || !s.pickedService) {
        setPrintError(`Shipment ${i + 1}: pick a carrier and service.`);
        return;
      }
    }

    // Build the payload — each shipment's inventoryIds come from
    // picks[itemIndex].id. If any picked slot is missing an inventory
    // pick, error like the single-shipment path does.
    const payloadShipments = splitShipments.map((s) => {
      const inventoryIds = s.itemIndices.map((i) => picks[i]?.id).filter(Boolean) as number[];
      if (inventoryIds.length !== s.itemIndices.length) {
        throw new Error("One or more items don't have an inventory pick.");
      }
      const insurance = Number(s.insuranceAmount) || 0;
      return {
        inventoryIds,
        weightOz: (Number(s.weightLb) || 0) * 16 + (Number(s.weightOz) || 0),
        carrierCode: s.pickedCarrier,
        serviceCode: s.pickedService,
        packageCode: s.packageCode,
        confirmation: s.confirmation,
        ...(insurance > 0
          ? { insuranceAmount: insurance, insuranceProvider: s.insuranceProvider }
          : {}),
      };
    });

    setPrinting(true);
    try {
      const resp = await authFetch(`${spaEndpoint}/shipping/print-split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: pickerRow.order.orderId,
          shipments: payloadShipments,
        }),
      });
      const data = await resp.json();
      if (!resp.ok && !Array.isArray(data.shipments)) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      // Success/partial: render one result card per shipment. Backend
      // returns { success, shipments: [{index, success, trackingNumber,
      // labelData, ...}] }.
      const perShipment = (data.shipments as any[]).map((r) => {
        let labelDataUrl: string | null = null;
        if (r.success && r.labelData) {
          const binary = atob(r.labelData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/pdf" });
          labelDataUrl = URL.createObjectURL(blob);
        }
        return {
          index: r.index,
          success: !!r.success,
          trackingNumber: r.trackingNumber ?? null,
          carrierCode: r.carrierCode ?? null,
          labelDataUrl,
          error: r.error,
        };
      });
      setSplitResults(perShipment);

      // Optimistic list update — if every shipment succeeded, drop
      // the row from pending. If any failed, leave it (ops needs to
      // see it to retry the remaining subset from a fresh call).
      if (data.success === true) {
        setShipments((prev) => prev.filter((s) => s.orderId !== pickerRow.order.orderId));
      }
    } catch (e) {
      if (handleAuthFailure(e)) return; setPrintError((e as Error).message ?? "Split print failed");
    } finally {
      setPrinting(false);
    }
  };

  // Cleanup labelDataUrls when the split result panel closes.
  const closeSplitResult = () => {
    for (const r of splitResults) {
      if (r.labelDataUrl) URL.revokeObjectURL(r.labelDataUrl);
    }
    setSplitResults([]);
    exitSplitMode();
    closePicker();
  };

  // KAN-44 Phase C — combine modal state. Opens when a shipper clicks
  // the "Combine with N" chip on a pending row. Modal shows all items
  // across the source orders + one shipment card (carrier/service/
  // weight/insurance). On Print: POST /shipping/print-combine → one
  // label, every source order marked shipped.
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineSourceRows, setCombineSourceRows] = useState<WorkRow[]>([]);
  const [combineInventoryIds, setCombineInventoryIds] = useState<number[]>([]);
  const [combineForm, setCombineForm] = useState({
    weightLb: "",
    weightOz: "",
    carrierCode: "",
    serviceCode: "",
    packageCode: "package",
    confirmation: "none",
    insuranceAmount: "",
    insuranceProvider: "carrier",
  });
  const [combineCarriers, setCombineCarriers] = useState<Array<{code: string; name: string}>>([]);
  const [combineServices, setCombineServices] = useState<Array<{code: string; name: string}>>([]);
  const [combinePackages, setCombinePackages] = useState<Array<{code: string; name: string}>>([]);
  const [combinePrinting, setCombinePrinting] = useState(false);
  const [combineError, setCombineError] = useState<string | null>(null);
  const [combineResult, setCombineResult] = useState<{
    trackingNumber: string | null;
    shipmentCost: number | null;
    carrierCode: string | null;
    labelDataUrl: string | null;
  } | null>(null);

  const openCombine = (primary: WorkRow) => {
    const peers = combinePeersFor(primary);
    setCombineSourceRows([primary, ...peers]);
    setCombineInventoryIds([]);
    setCombineForm({
      weightLb: "", weightOz: "",
      carrierCode: "", serviceCode: "",
      packageCode: "package", confirmation: "none",
      insuranceAmount: "", insuranceProvider: "carrier",
    });
    setCombineResult(null);
    setCombineError(null);
    setCombineOpen(true);
  };
  const closeCombine = () => {
    if (combineResult?.labelDataUrl) URL.revokeObjectURL(combineResult.labelDataUrl);
    setCombineOpen(false);
    setCombineResult(null);
    setCombineSourceRows([]);
    setCombineInventoryIds([]);
  };

  // Load carriers + services + packages on combine modal open / carrier change.
  useEffect(() => {
    if (!combineOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${apiEndpoint}/shipping/carriers`);
        const data = await resp.json();
        if (!cancelled && data.success !== false) setCombineCarriers(data.carriers ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, combineOpen]);
  useEffect(() => {
    if (!combineOpen || !combineForm.carrierCode) return;
    let cancelled = false;
    (async () => {
      try {
        const [svcResp, pkgResp] = await Promise.all([
          fetch(`${apiEndpoint}/shipping/carriers/${combineForm.carrierCode}/services`),
          fetch(`${apiEndpoint}/shipping/carriers/${combineForm.carrierCode}/packages`),
        ]);
        const svc = await svcResp.json();
        const pkg = await pkgResp.json();
        if (cancelled) return;
        if (svc.success !== false) setCombineServices(svc.services ?? []);
        if (pkg.success !== false) setCombinePackages(pkg.packages ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, combineOpen, combineForm.carrierCode]);

  const fireCombinePrint = async () => {
    setCombineError(null);
    const f = combineForm;
    const wOz = (Number(f.weightLb) || 0) * 16 + (Number(f.weightOz) || 0);
    if (combineSourceRows.length < 2) {
      setCombineError("Need at least 2 orders to combine.");
      return;
    }
    if (combineInventoryIds.length === 0) {
      setCombineError("Pick at least one inventory unit for the combined shipment.");
      return;
    }
    if (wOz <= 0) { setCombineError("Enter a weight."); return; }
    if (!f.carrierCode || !f.serviceCode) {
      setCombineError("Pick a carrier and service."); return;
    }
    setCombinePrinting(true);
    try {
      const insurance = Number(f.insuranceAmount) || 0;
      const resp = await authFetch(`${spaEndpoint}/shipping/print-combine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: combineSourceRows.map((r) => r.order.orderId),
          inventoryIds: combineInventoryIds,
          weightOz: wOz,
          carrierCode: f.carrierCode,
          serviceCode: f.serviceCode,
          packageCode: f.packageCode,
          confirmation: f.confirmation,
          ...(insurance > 0 ? { insuranceAmount: insurance, insuranceProvider: f.insuranceProvider } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      let labelDataUrl: string | null = null;
      if (data.labelData) {
        const binary = atob(data.labelData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        labelDataUrl = URL.createObjectURL(blob);
      }
      setCombineResult({
        trackingNumber: data.trackingNumber ?? null,
        shipmentCost: data.shipmentCost ?? null,
        carrierCode: data.carrierCode ?? null,
        labelDataUrl,
      });
      // Drop all combined orders from the pending list optimistically.
      const combinedIds = new Set(combineSourceRows.map((r) => r.order.orderId));
      setShipments((prev) => prev.filter((s) => !combinedIds.has(s.orderId)));
    } catch (e) {
      if (handleAuthFailure(e)) return; setCombineError((e as Error).message ?? "Combine print failed");
    } finally {
      setCombinePrinting(false);
    }
  };

  // KAN-44 Phase B — "New shipment" (no order upstream) modal state.
  // Opens from the header "+ New shipment" button. Ops types a shipTo
  // address + parcel details, hits Print, gets tracking# back.
  const [manualShipOpen, setManualShipOpen] = useState(false);
  const [manualShip, setManualShip] = useState({
    name: "",
    company: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    phone: "",
    residential: true,
    weightLb: "",
    weightOz: "",
    carrierCode: "",
    serviceCode: "",
    packageCode: "package",
    confirmation: "none",
    insuranceAmount: "",
    insuranceProvider: "carrier",
    // v2 (Adam 2026-08-12): optional inventory linkage + freeform
    // notes. Comma-separated inventory IDs get tracking# attached to
    // them on print + surface in the ShipStation order's items.
    inventoryIds: "",
    notes: "",
  });
  const [manualCarriers, setManualCarriers] = useState<Array<{code: string; name: string}>>([]);
  const [manualServices, setManualServices] = useState<Array<{code: string; name: string}>>([]);
  const [manualPackages, setManualPackages] = useState<Array<{code: string; name: string}>>([]);
  const [manualPrinting, setManualPrinting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<{
    trackingNumber: string | null;
    shipmentCost: number | null;
    carrierCode: string | null;
    labelDataUrl: string | null;
  } | null>(null);

  // Load carriers when the manual-ship modal opens.
  useEffect(() => {
    if (!manualShipOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${apiEndpoint}/shipping/carriers`);
        const data = await resp.json();
        if (!cancelled && data.success !== false) setManualCarriers(data.carriers ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, manualShipOpen]);

  // Load services + packages when the shipper picks a carrier in the
  // manual-ship modal.
  useEffect(() => {
    if (!manualShipOpen || !manualShip.carrierCode) return;
    let cancelled = false;
    (async () => {
      try {
        const [svcResp, pkgResp] = await Promise.all([
          fetch(`${apiEndpoint}/shipping/carriers/${manualShip.carrierCode}/services`),
          fetch(`${apiEndpoint}/shipping/carriers/${manualShip.carrierCode}/packages`),
        ]);
        const svc = await svcResp.json();
        const pkg = await pkgResp.json();
        if (cancelled) return;
        if (svc.success !== false) setManualServices(svc.services ?? []);
        if (pkg.success !== false) setManualPackages(pkg.packages ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [apiEndpoint, manualShipOpen, manualShip.carrierCode]);

  const closeManualShip = () => {
    if (manualResult?.labelDataUrl) URL.revokeObjectURL(manualResult.labelDataUrl);
    setManualShipOpen(false);
    setManualResult(null);
    setManualError(null);
  };

  const fireManualPrint = async () => {
    setManualError(null);
    const m = manualShip;
    const wOz = (Number(m.weightLb) || 0) * 16 + (Number(m.weightOz) || 0);
    if (!m.name || !m.street1 || !m.city || !m.state || !m.postalCode) {
      setManualError("Fill in name, street, city, state, and zip.");
      return;
    }
    if (wOz <= 0) { setManualError("Enter a weight."); return; }
    if (!m.carrierCode || !m.serviceCode) {
      setManualError("Pick a carrier and service.");
      return;
    }
    setManualPrinting(true);
    try {
      const insurance = Number(m.insuranceAmount) || 0;
      // v2: optional inventory linkage — comma-separated IDs get
      // parsed to numbers, invalid/blank entries dropped.
      const invIds = m.inventoryIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const resp = await authFetch(`${spaEndpoint}/shipping/print-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipTo: {
            name: m.name,
            ...(m.company ? { company: m.company } : {}),
            street1: m.street1,
            ...(m.street2 ? { street2: m.street2 } : {}),
            city: m.city,
            state: m.state,
            postalCode: m.postalCode,
            country: m.country || "US",
            ...(m.phone ? { phone: m.phone } : {}),
            residential: m.residential,
          },
          weightOz: wOz,
          carrierCode: m.carrierCode,
          serviceCode: m.serviceCode,
          packageCode: m.packageCode,
          confirmation: m.confirmation,
          ...(insurance > 0 ? { insuranceAmount: insurance, insuranceProvider: m.insuranceProvider } : {}),
          ...(invIds.length > 0 ? { inventoryIds: invIds } : {}),
          ...(m.notes ? { notes: m.notes } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      let labelDataUrl: string | null = null;
      if (data.labelData) {
        const binary = atob(data.labelData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        labelDataUrl = URL.createObjectURL(blob);
      }
      setManualResult({
        trackingNumber: data.trackingNumber ?? null,
        shipmentCost: data.shipmentCost ?? null,
        carrierCode: data.carrierCode ?? null,
        labelDataUrl,
      });
    } catch (e) {
      if (handleAuthFailure(e)) return; setManualError((e as Error).message ?? "Manual print failed");
    } finally {
      setManualPrinting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gr-beige flex items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-lg shadow-md p-6 w-full max-w-sm border-2 border-gr-black"
        >
          <h1 className="text-xl font-bold text-gr-black mb-3">Shipping Work</h1>
          <p className="text-sm text-gray-600 mb-4">Enter the shared password to continue.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
            placeholder="Password"
            autoFocus
          />
          {authError && <div className="text-red-600 text-sm mb-2">{authError}</div>}
          <button
            type="submit"
            className="w-full bg-gr-green-dark text-white font-bold py-2 rounded hover:opacity-90"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gr-beige-light" style={{ colorScheme: "light" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        html, body {
          color-scheme: light !important;
          background-color: #ffffff !important;
          color: #111827 !important;
        }
      ` }} />

      <div className="max-w-[1600px] mx-auto p-4 pr-24">
        {/* Header */}
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-gr-black">Shipping Work</h1>
            <span className="text-sm font-semibold text-gr-black/70">
              {tab === "pending" ? (
                <>
                  {filtered.length}
                  <span className="text-gr-black/50"> of {rows.length} rows · {sorted.length} orders</span>
                </>
              ) : (
                <>
                  {filteredShipped.length}
                  <span className="text-gr-black/50"> of {shippedRows.length} shipped today</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <button
              type="button"
              onClick={() => setManualShipOpen(true)}
              className="px-2 py-1 rounded border border-purple-300 bg-purple-50 text-purple-800 text-xs font-bold hover:bg-purple-100"
              title="Print a label with no ShipStation order upstream (KAN-44 Phase B)"
            >
              + New shipment
            </button>
            <span>
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              {isRefreshing && " · refreshing…"}
            </span>
            {authUser && (
              <span className="inline-flex items-center gap-1.5 border-l border-slate-300 pl-3">
                <span className="text-gray-700 font-semibold">{authUser.name || authUser.email}</span>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-xs text-gray-500 hover:text-red-700 underline"
                  title="Sign out"
                >
                  Sign out
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Tabs — Pending (active) / Shipped Today */}
        <div className="flex items-center gap-1 border-b border-slate-300 mb-3">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === "pending"
                ? "border-gr-green-dark text-gr-black"
                : "border-transparent text-gray-500 hover:text-gr-black"
            }`}
          >
            Pending
            <span className="ml-2 text-xs font-semibold text-gray-500">{sorted.length}</span>
          </button>
          <button
            onClick={() => setTab("shipped")}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === "shipped"
                ? "border-gr-green-dark text-gr-black"
                : "border-transparent text-gray-500 hover:text-gr-black"
            }`}
          >
            Shipped Today
            <span className="ml-2 text-xs font-semibold text-gray-500">{shippedSorted.length}</span>
          </button>
        </div>

        {/* Search + errors */}
        <div className="flex items-center gap-3 mb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, order #, customer, or city…"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
          />
        </div>
        {loadError && (
          <div className="border-2 border-red-400 bg-red-50 text-red-800 rounded px-3 py-2 text-sm mb-3">
            Couldn't refresh: {loadError}
          </div>
        )}

        {/* Table — pending tab active */}
        {tab === "pending" && (
        <div className="border-2 border-gr-black rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-2 py-2">Age</th>
                  <th className="text-left px-2 py-2">SKU</th>
                  <th className="text-left px-2 py-2">Model</th>
                  <th className="text-left px-2 py-2">Marketplace</th>
                  <th className="text-left px-2 py-2">Service</th>
                  <th className="text-left px-2 py-2">Customer</th>
                  <th className="text-left px-2 py-2">City</th>
                  <th className="text-left px-2 py-2">State</th>
                  <th className="text-right px-2 py-2">Total</th>
                  <th className="text-center px-2 py-2 w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-gray-500 py-8">
                      {rows.length === 0 ? "No pending shipments." : "No rows match that search."}
                    </td>
                  </tr>
                )}
                {filtered.map((r, idx) => {
                  const o = r.order;
                  const hrs = hoursOld(o.orderDate);
                  const svc = serviceBadge(o);
                  const customer = o.shipTo?.name ?? o.customerEmail ?? "—";
                  const multi = r.items.length > 1;
                  const key = `${o.orderId ?? o.orderNumber}`;
                  return (
                    <tr
                      key={key}
                      className={`border-t border-slate-200 hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                    >
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ageBadgeClass(hrs)}`}
                          title={o.orderDate ?? ""}
                        >
                          {ageString(o.orderDate)}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono font-bold text-gray-900 align-top">
                        {multi && (
                          <div className="text-[10px] font-sans font-bold text-purple-700 uppercase mb-0.5">
                            {r.items.length}-item order
                          </div>
                        )}
                        {r.items.map((it, i) => {
                          const qty = it.quantity ?? 1;
                          return (
                            <div key={i} className={i > 0 ? "mt-0.5" : ""}>
                              {it.sku ?? "—"}
                              {qty > 1 && <span className="ml-1 text-gr-green-dark text-xs">× {qty}</span>}
                            </div>
                          );
                        })}
                      </td>
                      <td className="px-2 py-2 text-gray-700 max-w-xs align-top">
                        {r.items.map((it, i) => (
                          <div key={i} className={`truncate ${i > 0 ? "mt-0.5" : ""}`} title={it.name ?? ""}>
                            {it.name ?? "—"}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        <MarketplaceBadge order={o} />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        {svc && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold border ${svc.className}`}>
                            {svc.label}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-800 font-medium whitespace-nowrap max-w-[14ch] truncate align-top" title={customer}>
                        {customer}
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap max-w-[14ch] truncate align-top" title={o.shipTo?.city ?? ""}>
                        {o.shipTo?.city ?? "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        {o.shipTo?.state && <StateToken state={o.shipTo.state} />}
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-green-700 whitespace-nowrap align-top">
                        {o.orderTotal !== undefined ? `$${Number(o.orderTotal).toFixed(2)}` : ""}
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => openPicker(r)}
                            className="inline-flex items-center px-3 py-1 rounded-md bg-gr-green-dark text-white text-xs font-bold hover:opacity-90"
                            title="Pick inventory unit(s), then print shipping label"
                          >
                            Print
                          </button>
                          {/* KAN-44 Phase C — combine chip. Visible only
                              when this row has same-address peers in
                              the pending list. */}
                          {combinePeersFor(r).length > 0 && (
                            <button
                              onClick={() => openCombine(r)}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100"
                              title={`This buyer/address has ${combinePeersFor(r).length + 1} pending orders. Combine into one label.`}
                            >
                              🔗 Combine with {combinePeersFor(r).length}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Table — shipped-today tab. Read-only, no Print button.
            Shows tracking + ship time + cost so shippers can spot-
            check what went out today without opening ShipStation. */}
        {tab === "shipped" && (
        <div className="border-2 border-gr-black rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-2 py-2">Shipped</th>
                  <th className="text-left px-2 py-2">Who</th>
                  <th className="text-left px-2 py-2">SKU</th>
                  <th className="text-left px-2 py-2">Model</th>
                  <th className="text-left px-2 py-2">Service</th>
                  <th className="text-left px-2 py-2">Customer</th>
                  <th className="text-left px-2 py-2">State</th>
                  <th className="text-left px-2 py-2">Tracking</th>
                  <th className="text-right px-2 py-2">Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipped.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-gray-500 py-8">
                      {shippedRows.length === 0 ? "Nothing shipped yet today." : "No rows match that search."}
                    </td>
                  </tr>
                )}
                {filteredShipped.map((r, idx) => {
                  const o = r.order as any;
                  const customer = o.shipTo?.name ?? o.customerEmail ?? "—";
                  const key = `${o.orderId ?? o.orderNumber}-shipped`;
                  // Prefer shipping_activity.created_at (real ops-clock
                  // time we billed the label) → ShipStation createDate
                  // (shipment record created) → shipDate (date-only, so
                  // 12:00 AM). Last two are fallbacks for pre-audit-log
                  // rows only.
                  const timeSource = o.shippedAt ?? o.createDate ?? o.shipDate ?? null;
                  const shipTime = timeSource
                    ? DateTime.fromISO(timeSource).setZone("America/New_York").toFormat("h:mm a")
                    : "—";
                  // Pretty service name: "fedex_home_delivery" →
                  // "FedEx Home Delivery". Handles carrier prefixes
                  // (fedex/ups/usps) as brand caps and title-cases the rest.
                  const prettyService = (code?: string | null) => {
                    if (!code) return "—";
                    return code
                      .split("_")
                      .map((w) => {
                        const l = w.toLowerCase();
                        if (l === "fedex") return "FedEx";
                        if (l === "ups") return "UPS";
                        if (l === "usps") return "USPS";
                        if (l === "am" || l === "pm") return l.toUpperCase();
                        return l.charAt(0).toUpperCase() + l.slice(1);
                      })
                      .join(" ");
                  };
                  return (
                    <tr
                      key={key}
                      className={`border-t border-slate-200 hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                    >
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 align-top">
                        {shipTime}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-800 align-top">
                        {o.shippedByUser ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-2 py-2 font-mono font-bold text-gray-900 align-top">
                        {r.items.map((it, i) => (
                          <div key={i} className={i > 0 ? "mt-0.5" : ""}>
                            {it.sku ?? "—"}
                            {(it.quantity ?? 1) > 1 && (
                              <span className="ml-1 text-gr-green-dark text-xs">× {it.quantity}</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-2 text-gray-700 max-w-xs align-top">
                        {r.items.map((it, i) => (
                          <div key={i} className={`truncate ${i > 0 ? "mt-0.5" : ""}`} title={it.name ?? ""}>
                            {it.name ?? "—"}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-2 text-xs text-gr-black align-top">
                        {prettyService(o.serviceCode)}
                      </td>
                      <td className="px-2 py-2 text-gray-800 font-medium whitespace-nowrap max-w-[14ch] truncate align-top" title={customer}>
                        {customer}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        {o.shipTo?.state && <StateToken state={o.shipTo.state} />}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap align-top font-mono text-xs text-gr-black">
                        {o.trackingNumber ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap align-top font-bold text-gr-black">
                        {o.shipmentCost !== null && o.shipmentCost !== undefined
                          ? `$${Number(o.shipmentCost).toFixed(2)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {/* Three-stage Print flow.
          Stage 1 (picker):  one section per SKU in the order, each with
                             its own SKU-scoped search.
          Stage 2 (confirm): all picks + weight; billing warning; fire.
          Stage 3 (result):  success card w/ tracking + fallback PDF. */}
      {pickerRow && (
        <div
          className="fixed inset-0 bg-black/40 flex items-start justify-center pt-16 pb-16 z-50 overflow-y-auto"
          onClick={printing ? undefined : closePicker}
        >
          <div
            className="bg-white rounded-lg shadow-2xl border-2 border-gr-black w-full max-w-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <div className="text-sm font-bold text-gr-black">
                  {printResult
                    ? "Label created"
                    : confirmMode
                      ? "Confirm & print"
                      : pickerRow.items.length > 1
                        ? `Pick inventory (${Object.keys(picks).length}/${pickerRow.items.length})`
                        : "Pick inventory"}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  Order #{pickerRow.order.orderNumber ?? pickerRow.order.orderId}
                  {/* SKU trail — ops loses track of what's in the box
                      once they're deep in the confirm modal. Show up
                      to 3 SKUs inline; more collapses to "+N more". */}
                  {pickerRow.items.length > 0 && (
                    <span className="ml-2 text-gr-black">
                      ·{" "}
                      {pickerRow.items.slice(0, 3).map((it, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-gray-400">, </span>}
                          <span className="font-bold">
                            {it.sku ?? "—"}
                          </span>
                          {(it.quantity ?? 0) > 1 && (
                            <span className="text-gr-green-dark"> ×{it.quantity}</span>
                          )}
                        </span>
                      ))}
                      {pickerRow.items.length > 3 && (
                        <span className="text-gray-500"> +{pickerRow.items.length - 3} more</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={closePicker}
                disabled={printing}
                className="text-gray-400 hover:text-gr-black text-lg leading-none disabled:opacity-40"
                title="Close"
              >
                ×
              </button>
            </div>

            {/* STAGE 3: Success card. */}
            {printResult ? (
              <div className="px-4 py-4">
                <div className="border border-emerald-300 bg-emerald-50 rounded px-3 py-3 mb-3">
                  <div className="text-emerald-900 font-bold text-sm mb-1">
                    ✓ Label created — sending to printer
                  </div>
                  <div className="text-emerald-800 text-xs">
                    The print dialog should have popped up automatically. If not, use the
                    <strong> Print label</strong> button below. Send it to the DYMO.
                  </div>
                </div>
                {/* Cost-anomaly warning — postage came in 2×+ what the
                    recommendation would have cost. Slack already got a
                    ping; this in-modal banner lets ops catch it before
                    they walk away. */}
                {printResult.anomaly && (
                  <div className="border border-red-400 bg-red-50 rounded px-3 py-3 mb-3">
                    <div className="text-red-900 font-bold text-sm mb-1">
                      ⚠️ Postage {printResult.anomaly.multiplier_seen.toFixed(1)}× higher than the recommendation
                    </div>
                    <div className="text-red-800 text-xs">
                      Billed <strong>${printResult.anomaly.actual_cost.toFixed(2)}</strong>{" "}
                      · Recommendation was <strong>${printResult.anomaly.recommended_cost.toFixed(2)}</strong>{" "}
                      (overrun <strong>+${printResult.anomaly.delta.toFixed(2)}</strong>).
                      A Slack alert was sent. Void this label in ShipStation if it was a misclick.
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-y-1 text-sm mb-3">
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Tracking</div>
                  <div className="font-mono text-gr-black">{printResult.trackingNumber ?? "—"}</div>
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Postage</div>
                  <div className="text-gr-black">
                    {printResult.shipmentCost !== null
                      ? `$${Number(printResult.shipmentCost).toFixed(2)}`
                      : "—"}
                  </div>
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Service</div>
                  <div className="text-gr-black">
                    {(printResult.carrierCode ?? "—").toUpperCase()} · {printResult.serviceCode ?? "—"}
                  </div>
                </div>

                {/* Hidden-ish PDF iframe. Its onLoad handler fires
                    contentWindow.print() inside the modal's own
                    user-gesture chain — more reliable than the old
                    window.open() approach that Chrome throttles. The
                    button below triggers it manually if the auto-print
                    didn't fire (some browsers still block it) and for
                    re-print. Kept visible-but-small so shippers can
                    see the label actually rendered — helps debug
                    "did anything print?" moments. */}
                {printResult.labelDataUrl && (
                  <>
                    <iframe
                      ref={labelIframeRef}
                      src={printResult.labelDataUrl}
                      title="Shipping label"
                      onLoad={() => {
                        try {
                          labelIframeRef.current?.contentWindow?.print();
                        } catch {
                          /* browser blocked / cross-origin — user can hit the button */
                        }
                      }}
                      className="w-full h-40 border border-slate-300 rounded mb-3"
                    />
                  </>
                )}

                <div className="flex items-center justify-between gap-2">
                  {printResult.labelDataUrl ? (
                    <button
                      onClick={() => {
                        try {
                          labelIframeRef.current?.contentWindow?.print();
                        } catch {
                          window.open(printResult.labelDataUrl!, "_blank");
                        }
                      }}
                      className="px-3 py-2 rounded border border-gr-green-dark text-gr-green-dark text-sm font-bold hover:bg-gr-mint-100"
                    >
                      Print label
                    </button>
                  ) : <span />}
                  <button
                    onClick={closePrintResult}
                    className="px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : confirmMode ? (
              /* STAGE 2: Confirmation — rate shopping + package
                 config + insurance top-up + fire. */
              <div className="px-4 py-4 space-y-3">
                {/* "Auto-applied" badge — visible when a shipping_rule
                    matched this order + set defaults. Tells shipper
                    the pre-picked carrier/service/signature/etc came
                    from a rule (not their own selection) and which
                    rule(s) fired. Managed in Nova → Shipping Rules. */}
                {matchedRules.length > 0 && (
                  <div className="border border-emerald-300 bg-emerald-50 rounded px-3 py-1.5 text-xs text-emerald-900 flex items-center gap-2">
                    <span className="text-emerald-700 font-bold">✓ Auto-applied:</span>
                    <span>
                      {matchedRules.map((r) => r.name).join(" · ")}
                    </span>
                    <span className="ml-auto text-[10px] text-emerald-700/70">
                      you can override anything below
                    </span>
                  </div>
                )}

                {/* KAN-44 Phase A — split-shipment toggle. Visible for
                    multi-item orders (single-item can't be split).
                    OFF: the current single-shipment UI below is rendered
                    as-is. ON: the single-shipment UI hides and the
                    split panel below takes over. */}
                {pickerRow.items.length >= 2 && (
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    <div className="text-xs text-gray-600">
                      This order has {pickerRow.items.length} items.
                    </div>
                    {!splitMode ? (
                      <button
                        type="button"
                        onClick={enterSplitMode}
                        className="ml-auto text-xs px-2 py-1 rounded border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100"
                      >
                        Split into multiple shipments →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={exitSplitMode}
                        className="ml-auto text-xs px-2 py-1 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      >
                        ← Back to single shipment
                      </button>
                    )}
                  </div>
                )}

                {/* KAN-44 — single-shipment wrapper. hidden={splitMode}
                    keeps the existing single-shipment UI intact and just
                    toggles its visibility. Closing div is marked with
                    "/single-shipment wrapper" for grep. */}
                <div className="space-y-3" hidden={splitMode}>

                {/* Ship-to + inventory summary. Now shows the full
                    address (street1/2/3, not just city/state) so
                    shippers can spot label-breaking addresses BEFORE
                    they burn postage. See the street3 warning below —
                    eBay accepts 3-line addresses but FedEx doesn't,
                    happens 1-2x/week. */}
                <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Ship to</div>
                    <div className="text-sm text-gr-black">
                      {pickerRow.order.shipTo?.name ?? "—"}
                    </div>
                    {pickerRow.order.shipTo?.company && (
                      <div className="text-xs text-gray-600">{pickerRow.order.shipTo.company}</div>
                    )}
                    {pickerRow.order.shipTo?.street1 && (
                      <div className="text-xs text-gray-700">{pickerRow.order.shipTo.street1}</div>
                    )}
                    {pickerRow.order.shipTo?.street2 && (
                      <div className="text-xs text-gray-700">{pickerRow.order.shipTo.street2}</div>
                    )}
                    {pickerRow.order.shipTo?.street3 && (
                      <div className="text-xs text-red-700 font-bold">
                        {pickerRow.order.shipTo.street3}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      {pickerRow.order.shipTo?.city ?? "—"},{" "}
                      <span className="font-bold text-gr-black">{pickerRow.order.shipTo?.state ?? "—"}</span>{" "}
                      {pickerRow.order.shipTo?.postalCode ?? ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      Inventory ({pickerRow.items.length})
                    </div>
                    <div className="text-xs font-mono text-gr-black leading-tight">
                      {pickerRow.items.map((_, i) => picks[i]?.id).filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>

                {/* Address warnings — surface things ShipStation will
                    accept for RATING but that carriers reject at
                    LABEL-CREATE time. Most common: 3-line addresses
                    from eBay (FedEx caps at 2 lines). Shipper needs
                    to squash street3 into street2 in ShipStation
                    before firing. */}
                {pickerRow.order.shipTo?.street3 && (
                  <div className="border border-red-400 bg-red-50 rounded px-3 py-2 text-xs text-red-900">
                    <strong>3-line address detected</strong> — eBay
                    accepts a third address line but FedEx doesn't.
                    Edit the address in ShipStation first (merge the
                    red line into Address 2), then come back and print.
                    {" "}
                    <a
                      href={`https://ship.shipstation.com/orders/awaiting-shipment?search=${encodeURIComponent(pickerRow.order.orderNumber ?? "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-bold"
                    >
                      Open in ShipStation →
                    </a>
                  </div>
                )}

                {/* Package + Residential row. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                      Package type
                      {packagesLoading && (
                        <svg className="w-3 h-3 animate-spin text-gr-green-dark" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                    </label>
                    <select
                      value={packageCode}
                      onChange={(e) => setPackageCode(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                    >
                      {/* Always list "package" as the safe default. */}
                      <option value="package">Package (default)</option>
                      {packages
                        .filter((p) => p.code !== "package")
                        .map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      {/* If the order's packageCode isn't in the fetched
                          list yet (packages still loading, or carrier
                          doesn't expose it), surface it as an option
                          anyway so the dropdown doesn't silently render
                          the wrong selection. Once packages loads with
                          a matching entry, this branch drops out. */}
                      {packageCode !== "package" &&
                        !packages.some((p) => p.code === packageCode) && (
                          <option value={packageCode}>
                            {packageCode} {packagesLoading ? "(loading…)" : "(carrier-specific)"}
                          </option>
                        )}
                    </select>
                  </div>
                  <div>
                    {(() => {
                      // ShipStation-determined value (from their address
                      // validation on order import). Kept as the pill /
                      // hint so the shipper knows what ShipStation
                      // classified — plus the override toggle for the
                      // rare "we know better" case (e.g., a business
                      // address that ShipStation flagged as residential).
                      const shipStationSays = pickerRow.order.shipTo?.residential;
                      const isOverridden = shipStationSays !== undefined && shipStationSays !== residential;
                      return (
                        <>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                            Delivery type
                            {shipStationSays !== undefined && (
                              <span
                                className={`normal-case tracking-normal text-[10px] font-normal px-1.5 py-0.5 rounded ${
                                  shipStationSays
                                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                                    : "bg-amber-100 text-amber-800 border border-amber-300"
                                }`}
                                title="ShipStation's address-validation classification"
                              >
                                ShipStation: {shipStationSays ? "Residential" : "Commercial"}
                              </span>
                            )}
                            {isOverridden && (
                              <span className="normal-case tracking-normal text-[10px] font-bold text-red-700">
                                overridden
                              </span>
                            )}
                          </label>
                          <div className="flex items-center gap-3 pt-1">
                            <label className="text-sm flex items-center gap-1 cursor-pointer">
                              <input
                                type="radio"
                                checked={residential}
                                onChange={() => setResidential(true)}
                              />
                              Residential
                            </label>
                            <label className="text-sm flex items-center gap-1 cursor-pointer">
                              <input
                                type="radio"
                                checked={!residential}
                                onChange={() => setResidential(false)}
                              />
                              Commercial
                            </label>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Signature / confirmation dropdown — Adam's ask.
                    Matches ShipStation's fixed values. Persists to the
                    order via `confirmation` on the print-label payload. */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Signature
                  </label>
                  <select
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                  >
                    <option value="none">None</option>
                    <option value="delivery">Delivery Confirmation</option>
                    <option value="signature">Signature Required</option>
                    <option value="adult_signature">Adult Signature Required</option>
                    {/* direct_signature is a FedEx-only option — UPS
                        and USPS both reject it at label-create time.
                        Hide when a non-FedEx carrier is picked. */}
                    {pickedCarrier === "fedex" && (
                      <option value="direct_signature">Direct Signature Required (FedEx)</option>
                    )}
                  </select>
                </div>

                {/* Weight + dimensions row. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                      Weight (lb / oz)
                      {weightHistorySamples > 0 && (
                        <span
                          className="normal-case tracking-normal text-[10px] font-normal px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300"
                          title={`Pre-filled from ${weightHistorySamples} past shipments of these SKUs. Verify on the scale — override if different.`}
                        >
                          ✓ auto-filled from {weightHistorySamples} past ships
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={weightLb}
                        onChange={(e) => setWeightLb(e.target.value)}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                        autoFocus
                      />
                      <span className="text-xs text-gray-600">lb</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="15.9"
                        value={weightOz}
                        onChange={(e) => setWeightOz(e.target.value)}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                      />
                      <span className="text-xs text-gray-600">oz</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Dimensions L × W × H (in)
                      <span className="ml-1 normal-case tracking-normal text-[9px] text-gray-400">optional</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={dimL}
                        onChange={(e) => setDimL(e.target.value)}
                        placeholder="L"
                        className="w-14 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                      />
                      <span className="text-xs text-gray-400">×</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={dimW}
                        onChange={(e) => setDimW(e.target.value)}
                        placeholder="W"
                        className="w-14 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                      />
                      <span className="text-xs text-gray-400">×</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={dimH}
                        onChange={(e) => setDimH(e.target.value)}
                        placeholder="H"
                        className="w-14 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                      />
                    </div>
                  </div>
                </div>

                {/* Carrier dropdown → rate table (all services for
                    that carrier). Middle-ground design after live-
                    testing feedback: Jon liked seeing the full service
                    comparison, but shopping ALL carriers at once was
                    slow (~5s) and rate-limited. Scoping to ONE carrier
                    is one ShipStation call (~1-2s) and still shows
                    every service side-by-side for that carrier.
                    Switch carrier → new table. */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                    Carrier
                    {carriersLoading && (
                      <svg className="w-3 h-3 animate-spin text-gr-green-dark" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                  </label>
                  <select
                    value={pickedCarrier ?? ""}
                    onChange={(e) => {
                      const newCarrier = e.target.value || null;
                      setPickedCarrier(newCarrier);
                      // Reset service — the new carrier has its own
                      // service list.
                      setPickedService(null);
                      // Downgrade FedEx-only "direct_signature" if
                      // the shipper switched to UPS/USPS — those
                      // carriers reject it at label-create time.
                      if (newCarrier !== "fedex" && confirmation === "direct_signature") {
                        setConfirmation("signature");
                      }
                      // Ops manually chose a carrier — stop the
                      // recommendation auto-apply from reverting it.
                      // Without this, the effect at ~line 570 sees
                      // (pickedCarrier != recommendation.carrierCode)
                      // and immediately writes the recommendation
                      // back — locking the shipper out of the
                      // dropdown ("clicking it does nothing").
                      setRateManuallyOverridden(true);
                    }}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                  >
                    <option value="">— pick a carrier —</option>
                    {carriers.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name || c.code.toUpperCase()}
                      </option>
                    ))}
                    {pickedCarrier && !carriers.some((c) => c.code === pickedCarrier) && (
                      <option value={pickedCarrier}>
                        {pickedCarrier.toUpperCase()} {carriersLoading ? "(loading…)" : "(from order)"}
                      </option>
                    )}
                  </select>
                </div>

                {/* Undeliverable-address warning: UPS + FedEx can't
                    deliver to PO Boxes OR military APO/FPO/DPO. Fires
                    when the currently-picked carrier is one of those.
                    Red — this is a "will fail at the carrier" warning,
                    not a "you could save money" nudge. */}
                {(isPoBox || isMilitary) &&
                  pickedCarrier &&
                  pickedCarrier !== "stamps_com" && (
                    <div className="border-2 border-red-500 bg-red-50 rounded-lg p-3 flex items-start gap-3">
                      <div className="text-2xl leading-none">⛔</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wider text-red-900">
                          {isPoBox ? "PO Box destination" : "Military address"} —{" "}
                          {pickedCarrier.toUpperCase()} won't deliver
                        </div>
                        <div className="text-sm text-red-900 mt-0.5">
                          Only USPS delivers to {isPoBox ? "PO Boxes" : "APO/FPO/DPO"}.
                          Switch the carrier to <strong>USPS (Stamps.com)</strong> or the
                          label will be returned/undeliverable.
                        </div>
                      </div>
                    </div>
                  )}

                {/* Recommendation chip — cheapest carrier+service that
                    meets the buyer's transit promise. Visible any time
                    a recommendation exists AND either (a) no service
                    is picked yet, or (b) the pick is more expensive
                    than the recommendation. If the pick already IS
                    the recommendation, we hide the chip to avoid
                    nagging. */}
                {recommendedRate && !rateManuallyOverridden && (() => {
                  const recTotal = recommendedRate.shipmentCost + recommendedRate.otherCost;
                  const isAlreadyPicked =
                    recommendedRate.carrierCode === pickedCarrier &&
                    recommendedRate.serviceCode === pickedService;
                  const savings = pickedTotal !== null ? pickedTotal - recTotal : null;
                  // Always render the chip when a recommendation exists.
                  // Applied → green confirmation badge. Not applied →
                  // yellow suggestion with "Use it" button. Keeping it
                  // visible even after auto-apply gives ops signal that
                  // the rec system is working, and diagnoses cases where
                  // auto-apply silently fails (chip visible but nothing
                  // picked in the rate table = something's broken).
                  const bg = isAlreadyPicked ? "bg-emerald-50" : "bg-yellow-50";
                  const border = isAlreadyPicked ? "border-emerald-400" : "border-yellow-400";
                  const icon = isAlreadyPicked ? "✓" : "⭐";
                  const heading = isAlreadyPicked ? "Auto-picked" : "Recommended";
                  const reasons = recommendation?.reasons ?? [];
                  return (
                    <div className={`${bg} border-2 ${border} rounded-lg p-3 flex items-start gap-3`}>
                      <div className="text-2xl leading-none">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-bold uppercase tracking-wider ${isAlreadyPicked ? "text-emerald-900" : "text-yellow-900"}`}>
                          {heading}
                        </div>
                        <div className="text-sm text-gr-black mt-0.5">
                          <span className="font-mono font-bold">{(recommendedRate.carrierCode ?? "").toUpperCase()}</span>
                          {" · "}
                          <span>{recommendedRate.serviceName || recommendedRate.serviceCode}</span>
                          {recommendedRate.transitDays != null && (
                            <span className="text-gray-600"> · ~{recommendedRate.transitDays}d</span>
                          )}
                          {" · "}
                          <span className="font-bold">${recTotal.toFixed(2)}</span>
                          {!isAlreadyPicked && savings !== null && savings > 0.5 && (
                            <span className="ml-2 inline-block bg-emerald-100 text-emerald-900 border border-emerald-300 rounded px-1.5 py-0.5 text-xs font-bold">
                              save ${savings.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {/* Reasoning line — WHY this pick. Ops shouldn't
                            have to guess: transit budget, USPS gate
                            outcome, savings math all summarized here. */}
                        {reasons.length > 0 && (
                          <div className={`text-[11px] mt-0.5 ${isAlreadyPicked ? "text-emerald-800" : "text-yellow-800"}`}>
                            because {reasons.join(" · ")}
                          </div>
                        )}
                      </div>
                      {!isAlreadyPicked && (
                        <button
                          type="button"
                          onClick={applyRecommendation}
                          className="px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold whitespace-nowrap self-center"
                        >
                          Use it
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Rate-history hint — "usually ~$18 across 12 past
                    ships." Signals what "normal" looks like so ops
                    catches an outlier rate before printing. Only
                    shows when we have >=3 past samples for the SKU. */}
                {rateHistory && rateHistory.stats && (
                  <div className="text-[11px] text-gray-600 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                    <span>📈</span>
                    <span>
                      This SKU {pickerRow.order.shipTo?.state ? `to ${pickerRow.order.shipTo.state}` : ""} usually ships for{" "}
                      <span className="font-bold text-gr-black">${rateHistory.stats.median.toFixed(2)}</span>{" "}
                      <span className="text-gray-500">
                        (range ${rateHistory.stats.min.toFixed(2)}–${rateHistory.stats.max.toFixed(2)} · {rateHistory.count} past ships)
                      </span>
                    </span>
                  </div>
                )}

                {/* Rate table. Per-carrier mode = single carrier's
                    services. Compare-all mode = every whitelisted
                    carrier's rates in one merged table sorted by cost. */}
                {(pickedCarrier || compareAllCarriers) && (
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        {compareAllCarriers
                          ? "All carriers · sorted by cost"
                          : (pickedCarrier ?? "").toUpperCase() + " services"}
                        {ratesLoading && (
                          <span className="inline-flex items-center gap-1 normal-case tracking-normal text-gr-green-dark font-semibold">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Fetching rates…
                          </span>
                        )}
                      </label>
                      {/* Compare-all toggle. Off = current per-carrier
                          view. On = cross-carrier rate shopping (backend
                          parallelizes + caches so wall-clock stays sane). */}
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compareAllCarriers}
                          onChange={(e) => setCompareAllCarriers(e.target.checked)}
                        />
                        <span>Compare all carriers</span>
                      </label>
                    </div>
                    <div className="border border-slate-200 rounded max-h-56 overflow-y-auto relative">
                      {ratesLoading && rates.length === 0 && (
                        <div className="text-center text-gr-black text-sm py-8 space-y-2">
                          <svg className="w-5 h-5 animate-spin mx-auto text-gr-green-dark" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <div className="text-xs text-gray-500">
                            Getting {compareAllCarriers ? "all carrier" : (pickedCarrier ?? "").toUpperCase()} rates…
                          </div>
                        </div>
                      )}
                      {ratesLoading && rates.length > 0 && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gr-green-dark/40 animate-pulse z-10" />
                      )}
                      {ratesError && (
                        <div className="text-red-700 bg-red-50 border-b border-red-300 px-3 py-2 text-sm">
                          {ratesError}
                        </div>
                      )}
                      {!ratesError && rates.length === 0 && !ratesLoading && (
                        <div className="text-center text-gray-500 text-sm py-6">
                          No rates yet — enter a weight to see options.
                        </div>
                      )}
                      {rates.length > 0 && (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-slate-700 text-xs uppercase tracking-wider">
                            <tr>
                              {compareAllCarriers && (
                                <th className="text-left px-2 py-1">Carrier</th>
                              )}
                              <th className="text-left px-2 py-1">Service</th>
                              <th className="text-right px-2 py-1">Transit</th>
                              <th className="text-right px-2 py-1">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(compareAllCarriers
                              ? [...rates].sort((a, b) => (a.shipmentCost + a.otherCost) - (b.shipmentCost + b.otherCost))
                              // Backend now returns all whitelisted carriers so the
                              // recommendation chip has cross-carrier data. Filter to
                              // the picked carrier for the single-carrier view.
                              : rates.filter((r) => r.carrierCode === pickedCarrier)
                            ).map((r) => {
                              // In compare mode a row matches only if
                              // BOTH carrier + service match — same
                              // serviceCode can exist across carriers.
                              const isPicked = compareAllCarriers
                                ? r.carrierCode === pickedCarrier && r.serviceCode === pickedService
                                : r.serviceCode === pickedService;
                              const total = r.shipmentCost + r.otherCost;
                              return (
                                <tr
                                  key={`${r.carrierCode}-${r.serviceCode}`}
                                  onClick={() => {
                                    // In compare mode picking a row
                                    // also switches carriers — the
                                    // shipper is committing to that
                                    // whole rate, not just the service.
                                    if (compareAllCarriers && r.carrierCode) {
                                      setPickedCarrier(r.carrierCode);
                                    }
                                    setPickedService(r.serviceCode);
                                    // Suppress the recommendation chip
                                    // once ops has deliberately picked
                                    // — no nagging on informed choice.
                                    setRateManuallyOverridden(true);
                                  }}
                                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${isPicked ? "bg-gr-mint-100" : ""}`}
                                >
                                  {compareAllCarriers && (
                                    <td className="px-2 py-1 text-gray-700 whitespace-nowrap font-mono text-xs">
                                      {(r.carrierCode ?? "").toUpperCase()}
                                    </td>
                                  )}
                                  <td className="px-2 py-1 text-gr-black">{r.serviceName || r.serviceCode}</td>
                                  <td
                                    className="px-2 py-1 text-right text-gray-600 whitespace-nowrap"
                                    title={r.transitDaysEstimated ? "Estimated max transit — carrier didn't provide a specific number" : ""}
                                  >
                                    {r.transitDays !== null
                                      ? `${r.transitDaysEstimated ? "~" : ""}${r.transitDays}d`
                                      : "—"}
                                  </td>
                                  <td className="px-2 py-1 text-right font-bold text-gr-black whitespace-nowrap">
                                    ${total.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* Insurance section.
                    Over $10k: always visible + auto-enabled + top-up
                      pre-filled with (orderTotal - 10000). External
                      policy covers first $10k, ShipStation covers rest.
                    Under $10k: opt-in via checkbox toggle. When
                      enabled, shipper types the amount they want. */}
                {(() => {
                  const orderTotal = pickerRow.order.orderTotal ?? 0;
                  const isHighValue = orderTotal > 10000;
                  const topUp = Math.max(0, Math.floor(orderTotal - 10000));
                  return (
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                        {isHighValue ? (
                          <>
                            Insurance top-up
                            <span className="normal-case tracking-normal text-[9px] text-gray-400 font-normal">
                              order total ${orderTotal.toLocaleString()} · our policy covers first $10k · top-up ${topUp.toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <label className="flex items-center gap-2 cursor-pointer normal-case tracking-normal font-normal text-sm text-gr-black">
                            <input
                              type="checkbox"
                              checked={insuranceEnabled}
                              onChange={(e) => {
                                setInsuranceEnabled(e.target.checked);
                                if (!e.target.checked) {
                                  setInsuranceAmount("");
                                }
                              }}
                            />
                            <span>Add insurance</span>
                            <span className="text-[9px] text-gray-400 uppercase tracking-wider">
                              (order under $10k — optional)
                            </span>
                          </label>
                        )}
                      </label>
                      {(isHighValue || insuranceEnabled) && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">$</span>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={insuranceAmount}
                            onChange={(e) => setInsuranceAmount(e.target.value)}
                            className="w-32 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                            placeholder={isHighValue ? "Top-up amount" : "Insured value"}
                          />
                          <span className="text-sm text-gray-600 ml-2">via</span>
                          <select
                            value={insuranceProvider}
                            onChange={(e) => setInsuranceProvider(e.target.value)}
                            disabled={!insuranceAmount || Number(insuranceAmount) <= 0}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark disabled:opacity-50"
                          >
                            <option value="carrier">Carrier (usually cheapest)</option>
                            <option value="shipsurance">ShipStation (Shipsurance)</option>
                            <option value="xcover">XCover</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Rate card — shows the cost breakdown for the
                    carrier+service pair the shipper picked. States:
                    - No carrier/service picked yet → prompt
                    - Loading → spinner + "Getting rate"
                    - Error → red banner
                    - Loaded → shipping + insurance + total
                    ShipStation's `otherCost` includes any Shipsurance
                    premium (we pass insurance into /getrates), so it's
                    the real number, not an estimate. */}
                {(() => {
                  const picked = rates.find((r) => r.serviceCode === pickedService);
                  if (!picked) {
                    if (!pickedCarrier) {
                      return (
                        <div className="border border-slate-200 bg-slate-50 rounded px-3 py-2 text-sm text-gray-500 text-center">
                          Pick a carrier to see available rates.
                        </div>
                      );
                    }
                    if (!pickedService) {
                      return (
                        <div className="border border-slate-200 bg-slate-50 rounded px-3 py-2 text-sm text-gray-500 text-center">
                          Click a service in the table above to select it.
                        </div>
                      );
                    }
                    return null;
                  }
                  const insurance = Number(insuranceAmount) || 0;
                  const shipping = picked.shipmentCost;
                  const other = picked.otherCost;
                  const total = shipping + other;
                  return (
                    <div className="border border-slate-300 bg-slate-50 rounded px-3 py-2 text-sm">
                      <div className="flex items-baseline justify-between text-xs text-gray-500 uppercase tracking-wider mb-1">
                        <span>Total to be billed</span>
                        <span className="text-[10px] font-normal normal-case tracking-normal">
                          {(pickedCarrier ?? "").toUpperCase()} · {picked.serviceName || pickedService}
                          {picked.transitDays !== null && (
                            <span className="ml-2 text-gray-400">
                              {picked.transitDaysEstimated ? "~" : ""}{picked.transitDays}d transit
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-gray-600">Shipping</span>
                        <span className="font-mono text-gr-black">${shipping.toFixed(2)}</span>
                      </div>
                      {other > 0 && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-gray-600">
                            {insurance > 0
                              ? `Insurance (${
                                  insuranceProvider === "shipsurance" ? "Shipsurance"
                                  : insuranceProvider === "xcover" ? "XCover"
                                  : "Carrier"
                                }, $${insurance.toLocaleString()})`
                              : "Other (confirmation/handling)"}
                          </span>
                          <span className="font-mono text-gr-black">${other.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-slate-300">
                        <span className="font-bold text-gr-black">Total</span>
                        <span className="font-mono font-bold text-lg text-gr-green-dark">${total.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Billing warning + fire. */}
                <div className="border border-amber-300 bg-amber-50 rounded px-3 py-2 text-xs text-amber-900">
                  <strong>Postage will be billed</strong> the moment you click Print. The label PDF
                  opens in a new tab and auto-triggers your browser's print dialog — send it to the
                  DYMO to get the physical label.
                </div>
                {printError && (
                  <div className="border border-red-400 bg-red-50 rounded px-3 py-2 text-sm text-red-800">
                    {printError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={backToPick}
                    disabled={printing}
                    className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    onClick={firePrint}
                    disabled={printing || !pickedCarrier || !pickedService}
                    className="px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                    title={(!pickedCarrier || !pickedService) ? "Pick a rate from the table first" : ""}
                  >
                    {printing ? "Printing…" : "Confirm & Print"}
                  </button>
                </div>
                </div>{/* /single-shipment wrapper — KAN-44 */}

                {/* KAN-44 Phase A — split-mode panel. Renders instead
                    of the single-shipment controls above when splitMode
                    is on. Each SplitShipment card lets the shipper pick
                    which items go in that shipment + its own carrier /
                    service / package / weight / signature / insurance.
                    On print: one POST to /shipping/print-split. */}
                {splitMode && (
                  <div className="space-y-3">
                    {splitShipments.map((s, si) => {
                      const totalItems = pickerRow.items.length;
                      const w = (Number(s.weightLb) || 0) * 16 + (Number(s.weightOz) || 0);
                      return (
                        <div key={si} className="border border-purple-300 bg-purple-50/40 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-bold text-purple-900">
                              Shipment {si + 1} ·{" "}
                              <span className="font-normal text-purple-700">
                                {s.itemIndices.length}/{totalItems} items
                              </span>
                            </div>
                            {splitShipments.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeSplitShipment(si)}
                                className="text-xs text-red-700 hover:underline"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          {/* Item allocation — every item in the order
                              renders as a chip. The chip is highlighted
                              on the shipment card it currently belongs
                              to. Click on another shipment's card to
                              move the item there (see the "Move here"
                              links below). */}
                          <div className="flex flex-wrap gap-1">
                            {pickerRow.items.map((it, ii) => {
                              const isHere = s.itemIndices.includes(ii);
                              return (
                                <button
                                  key={ii}
                                  type="button"
                                  onClick={() => assignItemToShipment(ii, si)}
                                  className={
                                    "text-[10px] px-1.5 py-0.5 rounded border " +
                                    (isHere
                                      ? "bg-purple-600 text-white border-purple-700"
                                      : "bg-white text-gray-500 border-gray-300 hover:bg-purple-100")
                                  }
                                  title={isHere ? "Already in this shipment" : "Move to this shipment"}
                                >
                                  {isHere ? "✓ " : ""}
                                  {it.name?.slice(0, 30) ?? `Item ${ii + 1}`}
                                  {(it.quantity ?? 0) > 1 ? ` ×${it.quantity}` : ""}
                                </button>
                              );
                            })}
                          </div>

                          {/* Per-shipment controls — carrier + service +
                              package + weight + signature + insurance.
                              Compact grid, one row per concern. */}
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-purple-200">
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">Carrier</label>
                              <select
                                value={s.pickedCarrier ?? ""}
                                onChange={(e) => {
                                  const newC = e.target.value || null;
                                  updateSplitShipment(si, {
                                    pickedCarrier: newC,
                                    pickedService: null,
                                    // Drop FedEx-only signature if switching off FedEx.
                                    ...(newC !== "fedex" && s.confirmation === "direct_signature"
                                      ? { confirmation: "signature" }
                                      : {}),
                                  });
                                }}
                                className="w-full text-xs border border-gray-300 rounded px-1.5 py-1"
                              >
                                <option value="">— pick —</option>
                                {carriers.map((c) => (
                                  <option key={c.code} value={c.code}>{c.name || c.code}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">Service</label>
                              <select
                                value={s.pickedService ?? ""}
                                onChange={(e) => updateSplitShipment(si, { pickedService: e.target.value || null })}
                                disabled={!s.pickedCarrier}
                                className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 disabled:bg-slate-100"
                              >
                                <option value="">— pick —</option>
                                {services.map((sv) => (
                                  <option key={sv.code} value={sv.code}>{sv.name || sv.code}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">Package</label>
                              <select
                                value={s.packageCode}
                                onChange={(e) => updateSplitShipment(si, { packageCode: e.target.value })}
                                className="w-full text-xs border border-gray-300 rounded px-1.5 py-1"
                              >
                                {packages.length === 0 && <option value="package">package</option>}
                                {packages.map((p) => (
                                  <option key={p.code} value={p.code}>{p.name || p.code}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">Signature</label>
                              <select
                                value={s.confirmation}
                                onChange={(e) => updateSplitShipment(si, { confirmation: e.target.value })}
                                className="w-full text-xs border border-gray-300 rounded px-1.5 py-1"
                              >
                                <option value="none">None</option>
                                <option value="delivery">Delivery Confirmation</option>
                                <option value="signature">Signature Required</option>
                                <option value="adult_signature">Adult Signature</option>
                                {/* FedEx-only — hidden for UPS/USPS */}
                                {s.pickedCarrier === "fedex" && (
                                  <option value="direct_signature">Direct (FedEx)</option>
                                )}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                                Weight (lb / oz) {w > 0 && <span className="text-gray-400 ml-1">= {w.toFixed(1)} oz</span>}
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number" step="1" min="0"
                                  value={s.weightLb}
                                  onChange={(e) => updateSplitShipment(si, { weightLb: e.target.value })}
                                  className="w-14 text-xs border border-gray-300 rounded px-1.5 py-1"
                                />
                                <span className="text-[10px] text-gray-600">lb</span>
                                <input
                                  type="number" step="0.1" min="0" max="15.9"
                                  value={s.weightOz}
                                  onChange={(e) => updateSplitShipment(si, { weightOz: e.target.value })}
                                  className="w-14 text-xs border border-gray-300 rounded px-1.5 py-1"
                                />
                                <span className="text-[10px] text-gray-600">oz</span>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                                Insurance ($, optional)
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number" step="1" min="0"
                                  value={s.insuranceAmount}
                                  onChange={(e) => updateSplitShipment(si, { insuranceAmount: e.target.value })}
                                  className="w-24 text-xs border border-gray-300 rounded px-1.5 py-1"
                                  placeholder="0"
                                />
                                <select
                                  value={s.insuranceProvider}
                                  onChange={(e) => updateSplitShipment(si, { insuranceProvider: e.target.value })}
                                  className="text-xs border border-gray-300 rounded px-1.5 py-1"
                                >
                                  <option value="carrier">Carrier</option>
                                  <option value="shipsurance">Shipsurance</option>
                                  <option value="xcover">XCover</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={addSplitShipment}
                      className="w-full text-xs px-3 py-2 rounded border border-dashed border-purple-400 text-purple-700 hover:bg-purple-50"
                    >
                      + Add another shipment
                    </button>

                    {printError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                        {printError}
                      </div>
                    )}

                    {splitResults.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">Results</div>
                        {splitResults.map((r) => (
                          <div
                            key={r.index}
                            className={
                              "text-xs p-2 rounded border " +
                              (r.success
                                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                : "bg-red-50 border-red-200 text-red-800")
                            }
                          >
                            <div className="font-bold">
                              Shipment {r.index + 1}: {r.success ? "printed" : "FAILED"}
                            </div>
                            {r.success && r.trackingNumber && (
                              <div className="font-mono">{r.carrierCode} · {r.trackingNumber}</div>
                            )}
                            {!r.success && r.error && <div>{r.error}</div>}
                            {r.labelDataUrl && (
                              <a
                                href={r.labelDataUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline mt-1 inline-block"
                              >
                                Open label PDF
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={splitResults.length > 0 ? closeSplitResult : exitSplitMode}
                        disabled={printing}
                        className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50 disabled:opacity-40"
                      >
                        {splitResults.length > 0 ? "Done" : "Cancel"}
                      </button>
                      <button
                        onClick={fireSplitPrint}
                        disabled={printing || splitResults.length > 0}
                        className="px-3 py-2 rounded bg-purple-700 text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                      >
                        {printing
                          ? "Printing…"
                          : splitResults.length > 0
                            ? "Done"
                            : `Print ${splitShipments.length} labels`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* STAGE 1: Picker — one section per line item in the order. */
              <>
                {pickerRow.items.length > 1 && (
                  <div className="px-4 py-2 border-b border-slate-200 bg-purple-50 text-xs text-purple-900">
                    <strong>{pickerRow.items.length}-item order.</strong> Pick one inventory unit
                    for each SKU below. All go on the same label.
                  </div>
                )}
                <div className="max-h-[60vh] overflow-y-auto">
                  {pickerRow.items.map((item, i) => (
                    <ItemPickerSection
                      key={`${pickerRow.order.orderId}-${i}`}
                      apiEndpoint={apiEndpoint}
                      item={item}
                      picked={picks[i]}
                      onPick={(inv) => setPickForItem(i, inv)}
                      onUnpick={() => unsetPickForItem(i)}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200">
                  <div className="text-xs text-gray-500">
                    {Object.keys(picks).length}/{pickerRow.items.length} picked
                  </div>
                  <button
                    onClick={goToConfirm}
                    disabled={!allPicked}
                    className="px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Right-side sidebar — matches the wall/dashboard/list-view
          sidebars so the four screens look like one app. Cross-nav +
          live status + wall-clock. Position:fixed so it stays put
          when the picker modal opens. z-40 sits below the modal's
          z-50 overlay. */}
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
              className="block p-2 mt-1 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="List View"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </Link>
            <Link
              to="/pending-shipments"
              className="block p-2 mt-1 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="Shipping Wall — Pending + Shipped Today"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8l1-4h12l1 4M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" />
              </svg>
            </Link>
            <div className="p-2 mt-1 text-white bg-gr-dark-hover rounded" title="Shipping Work (Current)">
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {(() => {
            const cutoff = shipCutoffState(currentTime);
            return (
              <div className="text-center bg-gr-dark-hover rounded-md py-2 px-1" title="Orders received before 2:45 PM ET must ship today">
                <div className={`font-black text-lg leading-none ${cutoff.className}`}>{cutoff.label}</div>
                <div className="text-[9px] text-gr-beige-light mt-1 leading-tight">til 2:45 PM</div>
              </div>
            );
          })()}

          <div className="text-xs space-y-2 text-center">
            <div>
              <div className="text-gr-beige-light text-xs">Updated</div>
              <div className="font-semibold text-xs">
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div>
              <div className="text-gr-beige-light text-xs">Orders</div>
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

      {/* KAN-44 Phase C — combine modal. Opens from the row-level
          "🔗 Combine with N" chip when a pending row shares its
          shipTo with other pending rows. Shows all items across the
          combined orders, one shipment card, prints one label. */}
      {combineOpen && combineSourceRows.length >= 2 && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8" onClick={closeCombine}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gr-black">
                  Combine {combineSourceRows.length} orders → 1 label
                </div>
                <div className="text-xs text-gray-500">
                  {combineSourceRows[0].order.shipTo?.name} ·{" "}
                  {combineSourceRows[0].order.shipTo?.city},{" "}
                  {combineSourceRows[0].order.shipTo?.state}{" "}
                  {combineSourceRows[0].order.shipTo?.postalCode}
                </div>
              </div>
              <button
                type="button"
                onClick={closeCombine}
                className="text-gray-500 hover:text-gr-black text-xl leading-none"
              >
                ×
              </button>
            </div>

            {combineResult ? (
              <div className="px-4 py-4 space-y-3">
                <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-3">
                  <div className="font-bold mb-1">Combined label printed</div>
                  <div className="font-mono text-xs">
                    {combineResult.carrierCode} · {combineResult.trackingNumber}
                  </div>
                  {combineResult.shipmentCost !== null && (
                    <div className="text-xs text-emerald-700 mt-1">
                      ${combineResult.shipmentCost?.toFixed(2)}
                    </div>
                  )}
                  <div className="text-xs text-emerald-700 mt-2">
                    Marked shipped: order {combineSourceRows.map((r) => "#" + r.order.orderNumber).join(", ")}
                  </div>
                </div>
                {combineResult.labelDataUrl && (
                  <iframe
                    src={combineResult.labelDataUrl}
                    className="w-full h-96 border border-slate-200 rounded"
                    title="Combined label preview"
                  />
                )}
                <div className="flex items-center justify-end gap-2">
                  {combineResult.labelDataUrl && (
                    <a
                      href={combineResult.labelDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50"
                    >
                      Open label PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={closeCombine}
                    className="px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-3">
                {/* Source orders summary + inventory picker */}
                <div>
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Items across {combineSourceRows.length} orders
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto border border-slate-200 rounded p-2 bg-slate-50/40">
                    {combineSourceRows.map((r) => (
                      <div key={r.order.orderId} className="text-xs">
                        <div className="font-bold text-gr-black">
                          Order #{r.order.orderNumber}{" "}
                          <span className="text-gray-500 font-normal">
                            · ${Number(r.order.orderTotal ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <ul className="list-disc pl-5 text-gray-700 mt-0.5">
                          {r.items.map((it, i) => (
                            <li key={i}>
                              <span className="font-mono">{it.sku ?? "—"}</span>{" "}
                              {it.name && <span className="text-gray-500">— {it.name}</span>}
                              {(it.quantity ?? 0) > 1 && <span className="ml-1 text-gr-green-dark">×{it.quantity}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inventory ids picker — free-form. Ops types comma-
                    separated inventory ids they've already scanned or
                    selected from another surface. v1 keeps this simple;
                    integrating with the per-item ItemPickerSection
                    (from the split flow) is a follow-up if needed. */}
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                    Inventory IDs (comma-separated) *
                  </label>
                  <input
                    placeholder="e.g. 12345, 12346, 12347"
                    value={combineInventoryIds.join(", ")}
                    onChange={(e) => {
                      const parsed = e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((n) => Number.isFinite(n) && n > 0);
                      setCombineInventoryIds(parsed);
                    }}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                  />
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Paste inventory IDs from your scan or Nova. All get tracking# attached at once.
                  </div>
                </div>

                {/* Shipping controls */}
                <div>
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Shipping</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={combineForm.carrierCode}
                      onChange={(e) => setCombineForm({ ...combineForm, carrierCode: e.target.value, serviceCode: "" })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="">— carrier —</option>
                      {combineCarriers.map((c) => (
                        <option key={c.code} value={c.code}>{c.name || c.code}</option>
                      ))}
                    </select>
                    <select
                      value={combineForm.serviceCode}
                      onChange={(e) => setCombineForm({ ...combineForm, serviceCode: e.target.value })}
                      disabled={!combineForm.carrierCode}
                      className="text-sm border border-gray-300 rounded px-2 py-1 disabled:bg-slate-100"
                    >
                      <option value="">— service —</option>
                      {combineServices.map((s) => (
                        <option key={s.code} value={s.code}>{s.name || s.code}</option>
                      ))}
                    </select>
                    <select
                      value={combineForm.packageCode}
                      onChange={(e) => setCombineForm({ ...combineForm, packageCode: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {combinePackages.length === 0 && <option value="package">package</option>}
                      {combinePackages.map((p) => (
                        <option key={p.code} value={p.code}>{p.name || p.code}</option>
                      ))}
                    </select>
                    <select
                      value={combineForm.confirmation}
                      onChange={(e) => setCombineForm({ ...combineForm, confirmation: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="none">Signature: none</option>
                      <option value="delivery">Delivery Confirmation</option>
                      <option value="signature">Signature Required</option>
                      <option value="adult_signature">Adult Signature</option>
                      {/* FedEx-only — hidden for UPS/USPS */}
                      {combineForm.carrierCode === "fedex" && (
                        <option value="direct_signature">Direct (FedEx)</option>
                      )}
                    </select>
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                        Weight (lb / oz)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" step="1" min="0"
                          value={combineForm.weightLb}
                          onChange={(e) => setCombineForm({ ...combineForm, weightLb: e.target.value })}
                          className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">lb</span>
                        <input
                          type="number" step="0.1" min="0" max="15.9"
                          value={combineForm.weightOz}
                          onChange={(e) => setCombineForm({ ...combineForm, weightOz: e.target.value })}
                          className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">oz</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                        Insurance ($, optional)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" step="1" min="0"
                          value={combineForm.insuranceAmount}
                          onChange={(e) => setCombineForm({ ...combineForm, insuranceAmount: e.target.value })}
                          className="w-28 text-sm border border-gray-300 rounded px-2 py-1"
                          placeholder="0"
                        />
                        <select
                          value={combineForm.insuranceProvider}
                          onChange={(e) => setCombineForm({ ...combineForm, insuranceProvider: e.target.value })}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="carrier">Carrier</option>
                          <option value="shipsurance">Shipsurance</option>
                          <option value="xcover">XCover</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {combineError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {combineError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeCombine}
                    disabled={combinePrinting}
                    className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={fireCombinePrint}
                    disabled={combinePrinting}
                    className="px-3 py-2 rounded bg-purple-700 text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                  >
                    {combinePrinting ? "Printing…" : `Print combined label (${combineSourceRows.length} orders)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KAN-44 Phase B — "New shipment" (no order upstream) modal.
          Opens from the header "+ New shipment" button. Ops types a
          shipTo + parcel + carrier/service, hits Print, gets tracking#
          back. Used for high-value ships kept out of the eBay-to-
          ShipStation auto pipeline (Abraham Mateo case). */}
      {manualShipOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8" onClick={closeManualShip}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gr-black">New shipment</div>
                <div className="text-xs text-gray-500">No ShipStation order — types the address by hand</div>
              </div>
              <button
                type="button"
                onClick={closeManualShip}
                className="text-gray-500 hover:text-gr-black text-xl leading-none"
              >
                ×
              </button>
            </div>

            {manualResult ? (
              /* Success — show tracking + open-PDF link. */
              <div className="px-4 py-4 space-y-3">
                <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-3">
                  <div className="font-bold mb-1">Label printed</div>
                  <div className="font-mono text-xs">
                    {manualResult.carrierCode} · {manualResult.trackingNumber}
                  </div>
                  {manualResult.shipmentCost !== null && (
                    <div className="text-xs text-emerald-700 mt-1">
                      ${manualResult.shipmentCost?.toFixed(2)}
                    </div>
                  )}
                </div>
                {manualResult.labelDataUrl && (
                  <iframe
                    src={manualResult.labelDataUrl}
                    className="w-full h-96 border border-slate-200 rounded"
                    title="Shipping label preview"
                  />
                )}
                <div className="flex items-center justify-end gap-2">
                  {manualResult.labelDataUrl && (
                    <a
                      href={manualResult.labelDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50"
                    >
                      Open label PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={closeManualShip}
                    className="px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-3">
                {/* Ship-to */}
                <div>
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Ship to</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Name *"
                      value={manualShip.name}
                      onChange={(e) => setManualShip({ ...manualShip, name: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    <input
                      placeholder="Company (optional)"
                      value={manualShip.company}
                      onChange={(e) => setManualShip({ ...manualShip, company: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    <input
                      placeholder="Street 1 *"
                      value={manualShip.street1}
                      onChange={(e) => setManualShip({ ...manualShip, street1: e.target.value })}
                      className="col-span-2 text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    <input
                      placeholder="Street 2 (optional)"
                      value={manualShip.street2}
                      onChange={(e) => setManualShip({ ...manualShip, street2: e.target.value })}
                      className="col-span-2 text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    <input
                      placeholder="City *"
                      value={manualShip.city}
                      onChange={(e) => setManualShip({ ...manualShip, city: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    <div className="flex gap-1">
                      <input
                        placeholder="ST *"
                        maxLength={2}
                        value={manualShip.state}
                        onChange={(e) => setManualShip({ ...manualShip, state: e.target.value.toUpperCase() })}
                        className="w-16 text-sm border border-gray-300 rounded px-2 py-1 uppercase"
                      />
                      <input
                        placeholder="Zip *"
                        value={manualShip.postalCode}
                        onChange={(e) => setManualShip({ ...manualShip, postalCode: e.target.value })}
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    </div>
                    <input
                      placeholder="Phone (optional)"
                      value={manualShip.phone}
                      onChange={(e) => setManualShip({ ...manualShip, phone: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={manualShip.residential}
                        onChange={(e) => setManualShip({ ...manualShip, residential: e.target.checked })}
                      />
                      Residential address
                    </label>
                  </div>
                </div>

                {/* Carrier / service / package */}
                <div>
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Shipping</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={manualShip.carrierCode}
                      onChange={(e) => setManualShip({ ...manualShip, carrierCode: e.target.value, serviceCode: "" })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="">— carrier —</option>
                      {manualCarriers.map((c) => (
                        <option key={c.code} value={c.code}>{c.name || c.code}</option>
                      ))}
                    </select>
                    <select
                      value={manualShip.serviceCode}
                      onChange={(e) => setManualShip({ ...manualShip, serviceCode: e.target.value })}
                      disabled={!manualShip.carrierCode}
                      className="text-sm border border-gray-300 rounded px-2 py-1 disabled:bg-slate-100"
                    >
                      <option value="">— service —</option>
                      {manualServices.map((s) => (
                        <option key={s.code} value={s.code}>{s.name || s.code}</option>
                      ))}
                    </select>
                    <select
                      value={manualShip.packageCode}
                      onChange={(e) => setManualShip({ ...manualShip, packageCode: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {manualPackages.length === 0 && <option value="package">package</option>}
                      {manualPackages.map((p) => (
                        <option key={p.code} value={p.code}>{p.name || p.code}</option>
                      ))}
                    </select>
                    <select
                      value={manualShip.confirmation}
                      onChange={(e) => setManualShip({ ...manualShip, confirmation: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="none">Signature: none</option>
                      <option value="delivery">Delivery Confirmation</option>
                      <option value="signature">Signature Required</option>
                      <option value="adult_signature">Adult Signature</option>
                      {/* FedEx-only — hidden for UPS/USPS */}
                      {manualShip.carrierCode === "fedex" && (
                        <option value="direct_signature">Direct (FedEx)</option>
                      )}
                    </select>
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                        Weight (lb / oz)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" step="1" min="0"
                          value={manualShip.weightLb}
                          onChange={(e) => setManualShip({ ...manualShip, weightLb: e.target.value })}
                          className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">lb</span>
                        <input
                          type="number" step="0.1" min="0" max="15.9"
                          value={manualShip.weightOz}
                          onChange={(e) => setManualShip({ ...manualShip, weightOz: e.target.value })}
                          className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">oz</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                        Insurance ($, optional)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" step="1" min="0"
                          value={manualShip.insuranceAmount}
                          onChange={(e) => setManualShip({ ...manualShip, insuranceAmount: e.target.value })}
                          className="w-28 text-sm border border-gray-300 rounded px-2 py-1"
                          placeholder="0"
                        />
                        <select
                          value={manualShip.insuranceProvider}
                          onChange={(e) => setManualShip({ ...manualShip, insuranceProvider: e.target.value })}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="carrier">Carrier</option>
                          <option value="shipsurance">Shipsurance</option>
                          <option value="xcover">XCover</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inventory linkage + notes (Adam 2026-08-12) */}
                <div>
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Inventory + notes (optional)
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                        Inventory IDs (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 43201, 43202"
                        value={manualShip.inventoryIds}
                        onChange={(e) => setManualShip({ ...manualShip, inventoryIds: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      />
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Rows get tracking# attached + marked shipped. Leave blank for pure off-inventory sends.
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">
                        Note
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Abraham Mateo — off-pipeline"
                        value={manualShip.notes}
                        onChange={(e) => setManualShip({ ...manualShip, notes: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      />
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Shows up on the ShipStation order so you can recognize the shipment later.
                      </div>
                    </div>
                  </div>
                </div>

                {manualError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {manualError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeManualShip}
                    disabled={manualPrinting}
                    className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={fireManualPrint}
                    disabled={manualPrinting}
                    className="px-3 py-2 rounded bg-purple-700 text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                  >
                    {manualPrinting ? "Printing…" : "Print label"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// -----------------------------------------------------------------------
// One section of the picker — dedicated to a single line item on the
// order. Owns its own fetch + query state so multiple sections coexist
// cleanly on a multi-item order without interfering. Parent tracks only
// the picked InventoryMatch via onPick / onUnpick callbacks.

function ItemPickerSection({
  apiEndpoint,
  item,
  picked,
  onPick,
  onUnpick,
}: {
  apiEndpoint: string | undefined;
  item: OrderItem;
  picked: InventoryMatch | undefined;
  onPick: (inv: InventoryMatch) => void;
  onUnpick: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<InventoryMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No fetch needed while this SKU already has a selection — the
    // shipper has committed a pick and the search list is hidden.
    if (picked) return;
    const sku = item.sku;
    if (!sku) {
      setMatches([]);
      setError("This item has no SKU — can't pick an inventory unit.");
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${apiEndpoint}/inventory/search?sku=${encodeURIComponent(sku)}&q=${encodeURIComponent(query)}`;
        const resp = await fetch(url, { signal: controller.signal });
        const data = await resp.json();
        if (data.success === false) throw new Error(data.error ?? "Search failed");
        setMatches(data.results ?? []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message ?? "Search failed");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [apiEndpoint, item.sku, query, picked]);

  const qty = item.quantity ?? 1;

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <div className="px-4 py-2 bg-slate-50">
        <div className="font-mono font-bold text-gr-black text-sm">
          {item.sku ?? "—"}
          {qty > 1 && <span className="ml-2 text-gr-green-dark text-xs">× {qty}</span>}
        </div>
        {item.name && (
          <div className="text-xs text-gray-600 truncate" title={item.name}>{item.name}</div>
        )}
      </div>

      {picked ? (
        <div className="px-4 py-3 flex items-center justify-between gap-3 bg-emerald-50/50">
          <div>
            <div className="text-xs text-emerald-800 uppercase tracking-wider mb-0.5">Picked</div>
            <div className="font-mono text-sm text-gr-black">
              #{picked.id} <span className="text-gray-500">· {picked.serial_number ?? "no serial"}</span>
            </div>
          </div>
          <button
            onClick={onUnpick}
            className="text-xs text-gray-600 underline hover:text-gr-black"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 py-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by inventory ID…"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading && (
              <div className="text-center text-gray-500 text-sm py-4">Searching…</div>
            )}
            {error && (
              <div className="text-red-700 bg-red-50 border border-red-300 rounded m-3 px-3 py-2 text-sm">
                {error}
              </div>
            )}
            {!loading && !error && matches.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-4">
                No in-stock units for this SKU.
              </div>
            )}
            {!loading && matches.length > 0 && (
              <ul>
                {matches.map((inv) => (
                  <li key={inv.id}>
                    <button
                      onClick={() => onPick(inv)}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-mono font-bold text-gr-black text-sm">#{inv.id}</div>
                        <div className="text-xs text-gray-500 font-mono truncate max-w-[60%]">
                          {inv.serial_number ?? "no serial"}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {matches.length > 0 && (
            <div className="text-xs text-gray-500 px-4 py-1">
              {matches.length} · oldest first
            </div>
          )}
        </>
      )}
    </div>
  );
}
