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
// Row model — one row per (order, line-item). Multi-item orders produce
// multiple rows so shippers can act on each SKU independently.

type WorkRow = {
  order: PendingShipment;
  item: NonNullable<PendingShipment["items"]>[number];
  itemIndex: number;
  itemCount: number;
};

type InventoryMatch = {
  id: number;
  sku: string | null;
  description: string | null;
  serial_number: string | null;
  created_at: string | null;
};

function flattenToRows(shipments: PendingShipment[]): WorkRow[] {
  const rows: WorkRow[] = [];
  for (const o of shipments) {
    const items = o.items ?? [];
    if (!items.length) continue;
    items.forEach((item, i) => {
      rows.push({ order: o, item, itemIndex: i, itemCount: items.length });
    });
  }
  return rows;
}

// -----------------------------------------------------------------------
// Default export

export default function PendingShipmentsWork() {
  const initial = useLoaderData<typeof loader>();
  const [shipments, setShipments] = useState<PendingShipment[]>(initial.shipments ?? []);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const rows = useMemo(() => flattenToRows(sorted), [sorted]);

  // Search filter: matches SKU, order#, customer name, or city.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const sku = (r.item.sku ?? "").toLowerCase();
      const orderNo = (r.order.orderNumber ?? "").toLowerCase();
      const name = (r.order.shipTo?.name ?? r.order.customerEmail ?? "").toLowerCase();
      const city = (r.order.shipTo?.city ?? "").toLowerCase();
      return sku.includes(q) || orderNo.includes(q) || name.includes(q) || city.includes(q);
    });
  }, [rows, query]);

  // Inventory picker state — one active row at a time (only one popover
  // open at once). `pickerRow` is the WorkRow whose Print button was
  // clicked; `pickerMatches` is the live list of inventory options for
  // that row's SKU, filtered further by `pickerQuery` (ID substring).
  const [pickerRow, setPickerRow] = useState<WorkRow | null>(null);
  const [pickerMatches, setPickerMatches] = useState<InventoryMatch[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // Fetch inventory matches whenever the picker opens or the search
  // query changes. Debounced lightly so typing doesn't spam the API.
  useEffect(() => {
    if (!pickerRow) return;
    const sku = pickerRow.item.sku;
    if (!sku) {
      setPickerMatches([]);
      setPickerError("This row has no SKU — can't pick an inventory unit.");
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setPickerLoading(true);
      setPickerError(null);
      try {
        const url = `${apiEndpoint}/inventory/search?sku=${encodeURIComponent(sku)}&q=${encodeURIComponent(pickerQuery)}`;
        const resp = await fetch(url, { signal: controller.signal });
        const data = await resp.json();
        if (data.success === false) throw new Error(data.error ?? "Search failed");
        setPickerMatches(data.results ?? []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setPickerError((e as Error).message ?? "Search failed");
      } finally {
        setPickerLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [pickerRow, pickerQuery, apiEndpoint]);

  const openPicker = (row: WorkRow) => {
    setPickerRow(row);
    setPickerQuery("");
    setPickerMatches([]);
    setPickerError(null);
  };
  const closePicker = () => {
    setPickerRow(null);
    setPickerQuery("");
    setPickerMatches([]);
    setPendingPick(null);
    setPrintError(null);
  };

  // Print flow state:
  //   pick inventory → confirm modal (with weight override) → fire.
  // ShipStation Connect on the paired machine has AutoPrint on, so
  // creating the label via API triggers Connect to physically print
  // — no browser tab needed. We show a success card with tracking# +
  // shipmentCost + a fallback "Download PDF" link (in case Connect
  // hiccups and the physical print didn't happen).
  const [pendingPick, setPendingPick] = useState<InventoryMatch | null>(null);
  const [weightOz, setWeightOz] = useState<string>("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printResult, setPrintResult] = useState<{
    trackingNumber: string | null;
    shipmentCost: number | null;
    carrierCode: string | null;
    serviceCode: string | null;
    labelDataUrl: string | null;
  } | null>(null);

  const confirmPick = (inv: InventoryMatch) => {
    setPendingPick(inv);
    setPrintError(null);
    // Default the weight input to whatever ShipStation has on the
    // order (usually populated by automation rules on import). Blank
    // string if unknown — shipper must fill it in before we submit.
    const w = pickerRow?.order.weight?.value;
    setWeightOz(w && w > 0 ? String(w) : "");
  };

  const cancelConfirm = () => {
    setPendingPick(null);
    setPrintError(null);
    setWeightOz("");
  };

  const firePrint = async () => {
    if (!pickerRow || !pendingPick) return;
    // Weight sanity check — refuse to fire on missing/nonsense values.
    const w = Number(weightOz);
    if (!weightOz || Number.isNaN(w) || w <= 0) {
      setPrintError("Enter a weight in ounces before printing.");
      return;
    }
    setPrinting(true);
    setPrintError(null);
    try {
      const resp = await fetch(`${apiEndpoint}/shipping/print-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: pickerRow.order.orderId,
          inventoryId: pendingPick.id,
          weightOz: w,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      // Convert base64 PDF to a blob URL for the fallback download
      // button. Connect should have already printed via AutoPrint.
      let labelDataUrl: string | null = null;
      if (data.labelData) {
        const binary = atob(data.labelData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        labelDataUrl = URL.createObjectURL(blob);
      }
      setPrintResult({
        trackingNumber: data.trackingNumber ?? null,
        shipmentCost: data.shipmentCost ?? null,
        carrierCode: data.carrierCode ?? null,
        serviceCode: data.serviceCode ?? null,
        labelDataUrl,
      });
      // Drop the pending row from the list optimistically (the 60s
      // poll would catch up but this feels responsive).
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

      <div className="max-w-[1600px] mx-auto p-4">
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
            <Link to="/pending-shipments" className="underline hover:text-gr-green-dark">
              Open wall view →
            </Link>
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
                  const qty = r.item.quantity ?? 1;
                  const key = `${o.orderId ?? o.orderNumber}-${r.itemIndex}`;
                  return (
                    <tr
                      key={key}
                      className={`border-t border-slate-200 hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                    >
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ageBadgeClass(hrs)}`}
                          title={o.orderDate ?? ""}
                        >
                          {ageString(o.orderDate)}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono font-bold text-gray-900">
                        {r.item.sku ?? "—"}
                        {qty > 1 && <span className="ml-1 text-gr-green-dark text-xs">× {qty}</span>}
                        {r.itemCount > 1 && (
                          <span className="ml-2 text-[10px] font-semibold text-purple-700" title="Multi-item order">
                            [{r.itemIndex + 1}/{r.itemCount}]
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-700 max-w-xs truncate" title={r.item.name ?? ""}>
                        {r.item.name ?? "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <MarketplaceBadge order={o} />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {svc && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold border ${svc.className}`}>
                            {svc.label}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-800 font-medium whitespace-nowrap max-w-[14ch] truncate" title={customer}>
                        {customer}
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap max-w-[14ch] truncate" title={o.shipTo?.city ?? ""}>
                        {o.shipTo?.city ?? "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {o.shipTo?.state && <StateToken state={o.shipTo.state} />}
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-green-700 whitespace-nowrap">
                        {o.orderTotal !== undefined && r.itemIndex === 0
                          ? `$${Number(o.orderTotal).toFixed(2)}`
                          : ""}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => openPicker(r)}
                          className="inline-flex items-center px-3 py-1 rounded-md bg-gr-green-dark text-white text-xs font-bold hover:opacity-90"
                          title="Pick inventory unit, then print shipping label"
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

      {/* Two-step Print flow.
          Step 1: pick inventory unit (searchable, SKU-scoped).
          Step 2: confirm — bills postage on click. */}
      {pickerRow && (
        <div
          className="fixed inset-0 bg-black/40 flex items-start justify-center pt-24 z-50"
          onClick={printing ? undefined : closePicker}
        >
          <div
            className="bg-white rounded-lg shadow-2xl border-2 border-gr-black w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <div className="text-sm font-bold text-gr-black">
                  {pendingPick ? "Confirm & print" : "Pick inventory unit"}
                </div>
                <div className="text-xs text-gray-500 font-mono">{pickerRow.item.sku ?? "—"}</div>
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

            {/* STEP 3: Success card — shown after a successful print. */}
            {printResult ? (
              <div className="px-4 py-4">
                <div className="border border-emerald-300 bg-emerald-50 rounded px-3 py-3 mb-3">
                  <div className="text-emerald-900 font-bold text-sm mb-1">
                    ✓ Label created — printing on paired machine
                  </div>
                  <div className="text-emerald-800 text-xs">
                    ShipStation Connect's AutoPrint will send this to the label printer wired to
                    the paired workstation. If it doesn't come out, use the fallback link below.
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
            ) : pendingPick ? (
              /* STEP 2: Confirmation */
              <div className="px-4 py-4">
                <div className="mb-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Order</div>
                  <div className="font-mono text-sm text-gr-black">
                    #{pickerRow.order.orderNumber ?? pickerRow.order.orderId}
                    <span className="text-gray-500 ml-2">
                      → {pickerRow.order.shipTo?.name ?? "—"}, {pickerRow.order.shipTo?.state ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Inventory unit</div>
                  <div className="font-mono text-sm text-gr-black">
                    #{pendingPick.id}
                    <span className="text-gray-500 ml-2">
                      · {pendingPick.serial_number ?? "no serial"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{pendingPick.description ?? "—"}</div>
                </div>
                <div className="mb-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Service</div>
                  <div className="text-sm text-gr-black">
                    {(pickerRow.order.carrierCode ?? "—").toUpperCase()} ·{" "}
                    {pickerRow.order.serviceCode ?? pickerRow.order.requestedShippingService ?? "—"}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
                    Weight (oz)
                    <span className="ml-2 normal-case tracking-normal text-[10px] text-gray-400">
                      pre-filled from order — verify or override
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={weightOz}
                    onChange={(e) => setWeightOz(e.target.value)}
                    className="w-32 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                    autoFocus
                  />
                  <span className="ml-2 text-xs text-gray-500">
                    {weightOz && !Number.isNaN(Number(weightOz))
                      ? `≈ ${(Number(weightOz) / 16).toFixed(2)} lb`
                      : ""}
                  </span>
                </div>
                <div className="border border-amber-300 bg-amber-50 rounded px-3 py-2 text-xs text-amber-900 mb-3">
                  <strong>Postage will be billed</strong> the moment you click Print. Label goes
                  to the paired machine's printer via ShipStation Connect AutoPrint.
                </div>
                {printError && (
                  <div className="border border-red-400 bg-red-50 rounded px-3 py-2 text-sm text-red-800 mb-3">
                    {printError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={cancelConfirm}
                    disabled={printing}
                    className="px-3 py-2 rounded border border-gray-300 text-gr-black text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    onClick={firePrint}
                    disabled={printing}
                    className="px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                  >
                    {printing ? "Printing…" : "Confirm & Print"}
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 1: Picker */
              <>
                <div className="px-4 py-3 border-b border-slate-200">
                  <input
                    type="search"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Filter by inventory ID…"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark"
                    autoFocus
                  />
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {pickerLoading && (
                    <div className="text-center text-gray-500 text-sm py-6">Searching…</div>
                  )}
                  {pickerError && (
                    <div className="text-red-700 bg-red-50 border border-red-300 rounded m-3 px-3 py-2 text-sm">
                      {pickerError}
                    </div>
                  )}
                  {!pickerLoading && !pickerError && pickerMatches.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-6">
                      No in-stock units for this SKU.
                    </div>
                  )}
                  {!pickerLoading && pickerMatches.length > 0 && (
                    <ul>
                      {pickerMatches.map((inv) => (
                        <li key={inv.id}>
                          <button
                            onClick={() => confirmPick(inv)}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="font-mono font-bold text-gr-black">#{inv.id}</div>
                              <div className="text-xs text-gray-500 font-mono truncate max-w-[60%]">
                                {inv.serial_number ?? "no serial"}
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 truncate">
                              {inv.description ?? "—"}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {pickerMatches.length > 0 && (
                  <div className="text-xs text-gray-500 px-4 py-2 border-t border-slate-200">
                    {pickerMatches.length} match{pickerMatches.length === 1 ? "" : "es"} · oldest listed first
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
