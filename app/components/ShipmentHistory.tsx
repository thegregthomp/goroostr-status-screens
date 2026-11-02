import React, { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { authFetch, AuthRequiredError } from "~/lib/auth.client";

/**
 * KAN-679: Shipping Work "History" tab. Shipments across dates (searchable,
 * paginated) and one shipment's recorded action timeline, from
 * GET /spa/shipping/history and /spa/shipping/history/{id} (staff login).
 *
 * The API never invents events; whatever it could not recover comes back as
 * `gaps`, shown above the timeline so a partial record is never read as a
 * complete audit trail.
 */

const ZONE = "America/New_York";

type Actor = { id: number | null; name?: string | null } | null;

type HistoryRow = {
  id: number;
  ship_date: string | null;
  label_created_at: string;
  tracking_number: string | null;
  tracking_numbers: string[];
  carrier: string | null;
  service_code: string | null;
  postage: string | null;
  postage_reason: string | null;
  label_status: "active" | "voided";
  customer: string | null;
  dest_state: string | null;
  order_numbers: string[];
  shipstation_order_ids: string[];
  units: { inventory_id: number; sku: string | null }[];
  parts: { parts_inventory_id: number; tag: string | null; part_type: string | null }[];
  unit_count: number;
  shipstation_skus: string[];
  package: {
    package_code: string | null;
    weight: { value: number; units: string | null } | null;
    dimensions: { length: number; width: number | null; height: number | null; units: string | null } | null;
  };
  recorded_via: "shipping_work" | "shipstation_notify";
  printed_by: Actor;
  printed_at: string | null;
  print_action: string | null;
  weight_oz: string | number | null;
  weight_source: string | null;
  flags: {
    combined: boolean;
    split: boolean;
    manual: boolean;
    other_labels_on_order: number;
    failed_attempts: number;
    additional_label: boolean;
  };
};

type TimelineEvent = {
  ref: string;
  source: string;
  at: string;
  type: string;
  action: string;
  outcome: string;
  actor: Actor;
  actor_note?: string | null;
  summary: string;
  details: Record<string, unknown>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type Coverage = {
  timezone: string;
  date_basis: string;
  sources: Record<string, { earliest: string | null; covers: string }>;
  not_recorded: string[];
};

type ListResponse = {
  shipments: HistoryRow[];
  page: number;
  per_page: number;
  total: number;
  last_page: number;
  filters: { from: string | null; to: string | null; q: string; field: string; timezone: string };
  coverage: Coverage;
};

type DetailResponse = {
  shipment: HistoryRow & {
    related_labels: { id: number; tracking_number: string | null; service_code: string | null; ship_date: string | null; label_status: string; postage: string | null; unit_count: number; units: number[] }[];
    marketplace: { notified: boolean; error: string | null; note: string };
  };
  timeline: TimelineEvent[];
  gaps: { code: string; message: string }[];
  scope_notes: string[];
  coverage: Coverage;
};

const FIELDS: { value: string; label: string }[] = [
  { value: "any", label: "Anything" },
  { value: "order", label: "Order #" },
  { value: "inventory", label: "Inventory ID" },
  { value: "sku", label: "SKU" },
  { value: "customer", label: "Customer" },
  { value: "tracking", label: "Tracking" },
];

const today = () => DateTime.now().setZone(ZONE).toISODate() ?? "";
const daysAgo = (n: number) => DateTime.now().setZone(ZONE).minus({ days: n }).toISODate() ?? "";

function prettyService(code?: string | null) {
  if (!code) return "—";
  return code
    .split("_")
    .map((w) => {
      const l = w.toLowerCase();
      if (l === "fedex") return "FedEx";
      if (l === "ups") return "UPS";
      if (l === "usps") return "USPS";
      return l.charAt(0).toUpperCase() + l.slice(1);
    })
    .join(" ");
}

function fmtTime(iso?: string | null, withDate = true) {
  if (!iso) return "—";
  const d = DateTime.fromISO(iso).setZone(ZONE);
  return d.isValid ? d.toFormat(withDate ? "LLL d, yyyy h:mm:ss a" : "h:mm a") : iso;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = DateTime.fromISO(iso.slice(0, 10), { zone: ZONE });
  return d.isValid ? d.toFormat("LLL d, yyyy") : iso;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Badge({ tone, children, title }: { tone: "slate" | "amber" | "red" | "blue" | "violet"; children: React.ReactNode; title?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-300",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    red: "bg-red-50 text-red-800 border-red-300",
    blue: "bg-sky-50 text-sky-800 border-sky-300",
    violet: "bg-violet-50 text-violet-800 border-violet-300",
  };
  return (
    <span title={title} className={`inline-block border rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide mr-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Flags({ r }: { r: HistoryRow }) {
  return (
    <>
      {r.label_status === "voided" && <Badge tone="red">Voided</Badge>}
      {r.flags.combined && <Badge tone="violet">Combined</Badge>}
      {r.flags.split && <Badge tone="blue" title={`${r.flags.other_labels_on_order} other label(s) on this order`}>Split</Badge>}
      {r.flags.manual && <Badge tone="slate">Manual</Badge>}
      {r.flags.additional_label && <Badge tone="amber">Extra label</Badge>}
      {r.flags.failed_attempts > 0 && <Badge tone="red">{r.flags.failed_attempts} failed</Badge>}
    </>
  );
}

const OUTCOME_DOT: Record<string, string> = {
  success: "bg-gr-green",
  failed: "bg-red-500",
  outcome_unknown: "bg-amber-500",
  pending: "bg-sky-400",
  info: "bg-slate-400",
};

export function ShipmentHistory({ spaEndpoint, onAuthRequired }: { spaEndpoint: string; onAuthRequired: () => void }) {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [allDates, setAllDates] = useState(false);
  const [q, setQ] = useState("");
  const [field, setField] = useState("any");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  // The applied query; the inputs above only take effect on Search.
  const [applied, setApplied] = useState({ from: daysAgo(6), to: today(), q: "", field: "any", allDates: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "50" });
      if (!applied.allDates || !applied.q) {
        if (applied.from) qs.set("from", applied.from);
        if (applied.to) qs.set("to", applied.to);
      }
      if (applied.q) {
        qs.set("q", applied.q);
        qs.set("field", applied.field);
      }
      const resp = await authFetch(`${spaEndpoint}/shipping/history?${qs.toString()}`);
      const body = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(body?.message ?? body?.error ?? `HTTP ${resp.status}`);
      setData(body as ListResponse);
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        onAuthRequired();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [spaEndpoint, page, applied, onAuthRequired]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setPage(1);
    setApplied({ from, to, q: q.trim(), field, allDates });
  };

  const preset = (days: number) => {
    const f = daysAgo(days - 1);
    const t = today();
    setFrom(f);
    setTo(t);
    setAllDates(false);
    setPage(1);
    setApplied({ from: f, to: t, q: q.trim(), field, allDates: false });
  };

  const cov = data?.coverage;
  const activityStart = cov?.sources?.shipping_activity?.earliest;
  const novaStart = cov?.sources?.inventory_purchase_shipments?.earliest;
  const rangeText = data
    ? data.filters.from || data.filters.to
      ? `${fmtDate(data.filters.from)} – ${fmtDate(data.filters.to)}`
      : "all stored dates"
    : "";

  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 mb-2">
        <label className="text-xs font-semibold text-gray-600">
          From
          <input type="date" value={from} max={to || undefined} disabled={allDates && !!q.trim()} onChange={(e) => setFrom(e.target.value)}
            className="block border border-gray-300 rounded px-2 py-1.5 text-sm disabled:opacity-40" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          To
          <input type="date" value={to} min={from || undefined} disabled={allDates && !!q.trim()} onChange={(e) => setTo(e.target.value)}
            className="block border border-gray-300 rounded px-2 py-1.5 text-sm disabled:opacity-40" />
        </label>
        <div className="flex gap-1 pb-0.5">
          {[1, 7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => preset(d)}
              className="px-2 py-1.5 text-xs font-semibold border border-gray-300 rounded hover:bg-slate-100">
              {d === 1 ? "Today" : `${d}d`}
            </button>
          ))}
        </div>
        <label className="flex-1 min-w-[220px] text-xs font-semibold text-gray-600">
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Order #, inventory ID, SKU, customer or tracking…"
            className="block w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gr-green-dark" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          In
          <select value={field} onChange={(e) => setField(e.target.value)} className="block border border-gray-300 rounded px-2 py-1.5 text-sm">
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 pb-2" title="Search every stored date instead of the date range">
          <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />
          All dates
        </label>
        <button type="submit" className="px-4 py-1.5 text-sm font-bold bg-gr-green-dark text-white rounded hover:bg-gr-dark-hover">
          Search
        </button>
      </form>

      <div className="text-xs text-gray-600 mb-3">
        {data && (
          <>
            <span className="font-semibold">{data.total.toLocaleString()} shipment{data.total === 1 ? "" : "s"}</span> · {rangeText} · dates are
            ship dates, times are Eastern ({cov?.timezone}).{" "}
          </>
        )}
        {novaStart && <>Stored shipments from {fmtDate(novaStart)}. </>}
        {activityStart && <>Shipping Work action log from {fmtDate(activityStart)}; older shipments have no who/when/attempt history.</>}
      </div>

      {error && (
        <div className="border-2 border-red-400 bg-red-50 text-red-800 rounded px-3 py-2 text-sm mb-3">Couldn't load history: {error}</div>
      )}

      <div className="border-2 border-gr-black rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-2">Ship date</th>
                <th className="text-left px-2 py-2">Who</th>
                <th className="text-left px-2 py-2">Order(s)</th>
                <th className="text-left px-2 py-2">Units / SKU</th>
                <th className="text-left px-2 py-2">Service</th>
                <th className="text-left px-2 py-2">Customer</th>
                <th className="text-left px-2 py-2">State</th>
                <th className="text-left px-2 py-2">Tracking</th>
                <th className="text-right px-2 py-2">Postage</th>
                <th className="text-left px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr><td colSpan={10} className="text-center text-gray-500 py-8">Loading…</td></tr>
              )}
              {data && data.shipments.length === 0 && (
                <tr><td colSpan={10} className="text-center text-gray-500 py-8">No shipments match.</td></tr>
              )}
              {data?.shipments.map((r, idx) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)}
                  className={`border-t border-slate-200 cursor-pointer hover:bg-gr-green-light/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <td className="px-2 py-2 whitespace-nowrap text-xs align-top">
                    <div className="font-semibold">{fmtDate(r.ship_date)}</div>
                    <div className="text-gray-500">{fmtTime(r.printed_at ?? r.label_created_at, false)}</div>
                  </td>
                  <td className="px-2 py-2 text-xs align-top">{r.printed_by?.name ?? <span className="text-gray-400" title="No Shipping Work print recorded">—</span>}</td>
                  <td className="px-2 py-2 text-xs align-top">{(r.order_numbers.length ? r.order_numbers : r.shipstation_order_ids).join(", ") || "—"}</td>
                  <td className="px-2 py-2 text-xs align-top">
                    {r.units.length > 0
                      ? r.units.map((u) => (
                          <div key={u.inventory_id}><span className="font-bold">{u.sku ?? "—"}</span> <span className="text-gray-500">#{u.inventory_id}</span></div>
                        ))
                      : <span className="text-gray-500">{r.shipstation_skus.join(", ") || "—"} <span className="italic">(no units linked)</span></span>}
                  </td>
                  <td className="px-2 py-2 text-xs align-top whitespace-nowrap">{prettyService(r.service_code)}</td>
                  <td className="px-2 py-2 text-xs align-top">{r.customer ?? "—"}</td>
                  <td className="px-2 py-2 text-xs align-top">{r.dest_state ?? "—"}</td>
                  <td className="px-2 py-2 text-xs align-top font-mono">{r.tracking_numbers.join(", ") || "—"}</td>
                  <td className="px-2 py-2 text-xs align-top text-right">{r.postage ? `$${r.postage}` : <span className="text-gray-400" title={r.postage_reason ?? ""}>—</span>}</td>
                  <td className="px-2 py-2 text-xs align-top"><Flags r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40">‹ Prev</button>
          <span className="text-gray-600">Page {data.page} of {data.last_page}</span>
          <button disabled={page >= data.last_page || loading} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40">Next ›</button>
        </div>
      )}

      {openId !== null && (
        <ShipmentDetail id={openId} spaEndpoint={spaEndpoint} onClose={() => setOpenId(null)} onOpen={setOpenId} onAuthRequired={onAuthRequired} />
      )}
    </div>
  );
}

function ShipmentDetail({ id, spaEndpoint, onClose, onOpen, onAuthRequired }: {
  id: number; spaEndpoint: string; onClose: () => void; onOpen: (id: number) => void; onAuthRequired: () => void;
}) {
  const [d, setD] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setD(null);
    setError(null);
    (async () => {
      try {
        const resp = await authFetch(`${spaEndpoint}/shipping/history/${id}`);
        const body = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(body?.error ?? `HTTP ${resp.status}`);
        if (live) setD(body as DetailResponse);
      } catch (e) {
        if (e instanceof AuthRequiredError) return onAuthRequired();
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [id, spaEndpoint, onAuthRequired]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = d?.shipment;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-3xl h-full overflow-y-auto bg-white shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-bold">Shipment {s ? s.tracking_numbers.join(", ") || `#${s.id}` : `#${id}`}</h2>
          <button onClick={onClose} className="text-sm px-2 py-1 border border-gray-300 rounded hover:bg-slate-100">Close</button>
        </div>
        {error && <div className="border-2 border-red-400 bg-red-50 text-red-800 rounded px-3 py-2 text-sm">{error}</div>}
        {!d && !error && <div className="text-gray-500 text-sm">Loading…</div>}
        {s && d && (
          <>
            <div className="mb-3"><Flags r={s} /></div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
              <dt className="text-gray-500">Ship date</dt><dd>{fmtDate(s.ship_date)}</dd>
              <dt className="text-gray-500">Label created</dt><dd>{fmtTime(s.label_created_at)}</dd>
              <dt className="text-gray-500">Printed by</dt><dd>{s.printed_by?.name ?? "not recorded"}{s.printed_at ? ` · ${fmtTime(s.printed_at)}` : ""}</dd>
              <dt className="text-gray-500">Recorded via</dt><dd>{s.recorded_via === "shipping_work" ? "Shipping Work print" : "ShipStation ship notification"}</dd>
              <dt className="text-gray-500">Orders</dt><dd>{(s.order_numbers.length ? s.order_numbers : s.shipstation_order_ids).join(", ") || "—"}</dd>
              <dt className="text-gray-500">Customer</dt><dd>{s.customer ?? "—"}{s.dest_state ? ` (${s.dest_state})` : ""}</dd>
              <dt className="text-gray-500">Service</dt><dd>{prettyService(s.service_code)}</dd>
              <dt className="text-gray-500">Postage (purchased)</dt><dd>{s.postage ? `$${s.postage}` : s.postage_reason ?? "—"}</dd>
              <dt className="text-gray-500">Weight</dt>
              <dd>{s.package.weight ? `${s.package.weight.value} ${s.package.weight.units ?? ""}` : "not recorded"}{s.weight_source ? ` (${s.weight_source})` : ""}</dd>
              <dt className="text-gray-500">Dimensions</dt>
              <dd>{s.package.dimensions ? `${s.package.dimensions.length} × ${s.package.dimensions.width ?? "?"} × ${s.package.dimensions.height ?? "?"} ${s.package.dimensions.units ?? ""}` : "not recorded"}</dd>
              <dt className="text-gray-500">Marketplace notified</dt><dd title={s.marketplace.note}>{s.marketplace.notified ? "yes" : "no record"}{s.marketplace.error ? ` — ${s.marketplace.error}` : ""}</dd>
            </dl>

            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-1">Units in this package ({s.unit_count})</h3>
            <ul className="text-sm mb-4">
              {s.units.map((u) => <li key={u.inventory_id}><span className="font-bold">{u.sku ?? "—"}</span> · inventory #{u.inventory_id}</li>)}
              {s.parts.map((p) => <li key={`p${p.parts_inventory_id}`}>{p.part_type ?? "part"} {p.tag ?? ""} · parts #{p.parts_inventory_id}</li>)}
              {s.unit_count === 0 && <li className="text-gray-500 italic">No units linked in Nova{s.shipstation_skus.length ? ` (ShipStation SKUs: ${s.shipstation_skus.join(", ")})` : ""}.</li>}
            </ul>

            {s.related_labels.length > 0 && (
              <>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-1">Other labels on the same order</h3>
                <ul className="text-sm mb-4">
                  {s.related_labels.map((l) => (
                    <li key={l.id}>
                      <button className="underline text-sky-800" onClick={() => onOpen(l.id)}>{l.tracking_number ?? `#${l.id}`}</button>{" "}
                      · {prettyService(l.service_code)} · {fmtDate(l.ship_date)} · {l.unit_count} unit(s){l.label_status === "voided" ? " · voided" : ""}{l.postage ? ` · $${l.postage}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {d.gaps.length > 0 && (
              <div className="border border-amber-300 bg-amber-50 rounded px-3 py-2 mb-4">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-1">Not in this record</div>
                <ul className="list-disc pl-5 text-xs text-amber-900 space-y-0.5">
                  {d.gaps.map((g) => <li key={g.code}>{g.message}</li>)}
                </ul>
              </div>
            )}

            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-2">Timeline (Eastern)</h3>
            <ol className="border-l-2 border-slate-200 ml-2">
              {d.timeline.map((e) => (
                <li key={e.ref} className="relative pl-4 pb-3">
                  <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ${OUTCOME_DOT[e.outcome] ?? "bg-slate-400"}`} title={e.outcome} />
                  <div className="text-xs text-gray-500">
                    {fmtTime(e.at)} · {e.actor?.name ?? e.actor_note ?? "not recorded"} · <span className="uppercase">{e.outcome.replace("_", " ")}</span>
                  </div>
                  <div className={`text-sm ${e.outcome === "failed" ? "text-red-800 font-semibold" : ""}`}>{e.summary}</div>
                  {(e.before || e.after) && (
                    <div className="text-xs text-slate-700 mt-0.5">
                      {Object.keys({ ...(e.before ?? {}), ...(e.after ?? {}) }).map((k) => (
                        <div key={k}><span className="text-gray-500">{k}:</span> {show(e.before?.[k])} → {show(e.after?.[k])}</div>
                      ))}
                    </div>
                  )}
                  {Object.keys(e.details ?? {}).length > 0 && (
                    <details className="text-xs text-gray-600 mt-0.5">
                      <summary className="cursor-pointer">details</summary>
                      <ul className="pl-3">
                        {Object.entries(e.details).map(([k, v]) => <li key={k}><span className="text-gray-500">{k}:</span> {show(v)}</li>)}
                      </ul>
                    </details>
                  )}
                  <div className="text-[10px] text-gray-400">{e.source}</div>
                </li>
              ))}
            </ol>
            {d.scope_notes.map((n) => <p key={n} className="text-xs text-gray-500 mt-2">{n}</p>)}
          </>
        )}
      </div>
    </div>
  );
}
