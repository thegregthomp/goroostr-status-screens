import React, { useEffect, useMemo, useState } from "react";
import type { LoaderArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getPendingShipments } from "~/models/orders.server";
import { useInterval } from "usehooks-ts";
import { DateTime } from "luxon";

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
  return json({
    ...data,
    apiEndpoint: process.env.GOROOSTR_ENDPOINT,
  });
}

// -----------------------------------------------------------------------
// Types + helpers (duplicated from pending-shipments.tsx; TODO: extract
// to app/components/shipments.tsx once both routes are stable)

type PendingShipment = {
  orderId?: number;
  orderNumber?: string;
  orderDate?: string;
  orderTotal?: number;
  customerEmail?: string;
  orderSource?: string;
  requestedShippingService?: string;
  serviceCode?: string;
  carrierCode?: string;
  packageCode?: string;
  weight?: { value?: number; units?: string };
  internalNotes?: string | null;
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

  // Search filter: matches any SKU on the order, order#, customer name,
  // or city.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const orderNo = (r.order.orderNumber ?? "").toLowerCase();
      const name = (r.order.shipTo?.name ?? r.order.customerEmail ?? "").toLowerCase();
      const city = (r.order.shipTo?.city ?? "").toLowerCase();
      const anySku = r.items.some((it) => (it.sku ?? "").toLowerCase().includes(q));
      return anySku || orderNo.includes(q) || name.includes(q) || city.includes(q);
    });
  }, [rows, query]);

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
  const [dimL, setDimL] = useState<string>("");
  const [dimW, setDimW] = useState<string>("");
  const [dimH, setDimH] = useState<string>("");
  const [residential, setResidential] = useState<boolean>(true);
  const [insuranceAmount, setInsuranceAmount] = useState<string>("");
  const [rates, setRates] = useState<Array<{
    carrierCode: string;
    serviceCode: string;
    serviceName: string;
    shipmentCost: number;
    otherCost: number;
    transitDays: number | null;
  }>>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [pickedCarrier, setPickedCarrier] = useState<string | null>(null);
  const [pickedService, setPickedService] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printResult, setPrintResult] = useState<{
    trackingNumber: string | null;
    shipmentCost: number | null;
    carrierCode: string | null;
    serviceCode: string | null;
    labelDataUrl: string | null;
  } | null>(null);

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
    // Insurance top-up defaults to (orderTotal - 10000) if that's positive.
    // External policy covers first $10k, so we only need supplemental
    // ShipStation coverage on the difference. Whole dollars.
    const orderTotal = row.order.orderTotal ?? 0;
    const topUp = Math.max(0, Math.floor(orderTotal - 10000));
    setInsuranceAmount(topUp > 0 ? String(topUp) : "");
    setRates([]);
    setRatesError(null);
    // Default the picked rate to whatever the order already has —
    // so a "just print with existing settings" click is one press.
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
    setDimL("");
    setDimW("");
    setDimH("");
    setInsuranceAmount("");
    setRates([]);
    setRatesLoading(false);
    setRatesError(null);
    setPickedCarrier(null);
    setPickedService(null);
  };

  // Rate fetch — fires whenever the shopper changes weight/package/
  // dims/residential in the confirm modal. Debounced 300ms so typing
  // in the weight field doesn't spam ShipStation. Also fetches once
  // on confirm-mode entry.
  useEffect(() => {
    if (!pickerRow || !confirmMode) return;
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
        const resp = await fetch(`${apiEndpoint}/shipping/rates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: pickerRow.order.orderId,
            weightOz: totalOz,
            packageCode,
            residential,
            ...(dims ? { dimensions: dims } : {}),
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
  }, [apiEndpoint, pickerRow, confirmMode, weightLb, weightOz, packageCode, residential, dimL, dimW, dimH]);

  // Fetch packages for the currently-picked carrier so the package
  // dropdown offers the right options (Fedex has "fedex_one_rate_*",
  // USPS has flat-rate boxes, etc.). Falls back to a bare "package"
  // if the fetch fails.
  useEffect(() => {
    if (!confirmMode || !pickedCarrier) return;
    let cancelled = false;
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

      const resp = await fetch(`${apiEndpoint}/shipping/print-label`, {
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
          ...(dims ? { dimensions: dims } : {}),
          ...(insurance > 0 ? { insuranceAmount: insurance } : {}),
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

        // Auto-open the PDF in a new tab and fire the browser's print
        // dialog on load. Needed because the shop-floor printer is a
        // DYMO (not a ZPL Zebra), so we can't push labels directly via
        // our printer-api — and ShipStation Connect's AutoPrint only
        // fires on labels created through their UI, not the API. The
        // shipper's browser + OS default printer become the delivery
        // path. Pop-up blocker will eat the new tab silently — the
        // fallback "Open label PDF" link on the success card is the
        // recovery hatch.
        const printWin = window.open(labelDataUrl, "_blank");
        if (printWin) {
          printWin.addEventListener("load", () => {
            try { printWin.print(); } catch { /* cross-origin / blocked */ }
          });
        }
      }
      setPrintResult({
        trackingNumber: data.trackingNumber ?? null,
        shipmentCost: data.shipmentCost ?? null,
        carrierCode: data.carrierCode ?? null,
        serviceCode: data.serviceCode ?? null,
        labelDataUrl,
      });
      // Drop the pending row from the list optimistically (60s poll
      // would catch up anyway, but this feels responsive).
      setShipments((prev) => prev.filter((s) => s.orderId !== pickerRow.order.orderId));
    } catch (e) {
      setPrintError((e as Error).message ?? "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  const closePrintResult = () => {
    if (printResult?.labelDataUrl) URL.revokeObjectURL(printResult.labelDataUrl);
    setPrintResult(null);
    closePicker();
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
              {filtered.length}
              <span className="text-gr-black/50"> of {rows.length} rows · {sorted.length} orders</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span>
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              {isRefreshing && " · refreshing…"}
            </span>
          </div>
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

        {/* Table */}
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
                        <button
                          onClick={() => openPicker(r)}
                          className="inline-flex items-center px-3 py-1 rounded-md bg-gr-green-dark text-white text-xs font-bold hover:opacity-90"
                          title="Pick inventory unit(s), then print shipping label"
                        >
                          Print
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
                    ✓ Label created — printing on paired machine
                  </div>
                  <div className="text-emerald-800 text-xs">
                    Your browser opened the label PDF in a new tab and triggered the print dialog —
                    send it to the DYMO. If the pop-up was blocked, use the fallback link below.
                  </div>
                </div>
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
                <div className="flex items-center justify-between gap-2">
                  {printResult.labelDataUrl ? (
                    <a
                      href={printResult.labelDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-600 underline hover:text-gr-black"
                    >
                      Open label PDF (fallback)
                    </a>
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
                {/* Ship-to + inventory summary (compact top row). */}
                <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Ship to</div>
                    <div className="text-sm text-gr-black">
                      {pickerRow.order.shipTo?.name ?? "—"}
                    </div>
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

                {/* Package + Residential row. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Package type
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
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Delivery type
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
                  </div>
                </div>

                {/* Weight + dimensions row. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Weight (lb / oz)
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

                {/* Rate-shopping table. */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                      Available rates {ratesLoading && <span className="ml-2 text-gray-400 normal-case tracking-normal">refreshing…</span>}
                    </label>
                    {pickedCarrier && pickedService && (
                      <span className="text-[10px] text-gr-green-dark uppercase tracking-wider font-bold">
                        Selected: {pickedCarrier.toUpperCase()} · {pickedService}
                      </span>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded max-h-56 overflow-y-auto">
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
                            <th className="text-left px-2 py-1">Carrier</th>
                            <th className="text-left px-2 py-1">Service</th>
                            <th className="text-right px-2 py-1">Transit</th>
                            <th className="text-right px-2 py-1">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rates.map((r) => {
                            const isPicked = r.carrierCode === pickedCarrier && r.serviceCode === pickedService;
                            const total = r.shipmentCost + r.otherCost;
                            return (
                              <tr
                                key={`${r.carrierCode}-${r.serviceCode}`}
                                onClick={() => { setPickedCarrier(r.carrierCode); setPickedService(r.serviceCode); }}
                                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${isPicked ? "bg-gr-mint-100" : ""}`}
                              >
                                <td className="px-2 py-1 uppercase text-xs font-bold text-gray-700">
                                  {r.carrierCode}
                                </td>
                                <td className="px-2 py-1 text-gr-black">{r.serviceName || r.serviceCode}</td>
                                <td className="px-2 py-1 text-right text-gray-600 whitespace-nowrap">
                                  {r.transitDays !== null ? `${r.transitDays}d` : "—"}
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

                {/* Insurance top-up — only when order value > $10k. */}
                {(pickerRow.order.orderTotal ?? 0) > 10000 && (
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Insurance top-up ($)
                      <span className="ml-1 normal-case tracking-normal text-[9px] text-gray-400">
                        our policy covers first $10k · order total ${Number(pickerRow.order.orderTotal).toFixed(2)}
                      </span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={insuranceAmount}
                      onChange={(e) => setInsuranceAmount(e.target.value)}
                      className="w-40 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                    />
                  </div>
                )}

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
