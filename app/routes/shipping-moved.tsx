export function meta() {
  return {
    title: "Shipping moved",
    "color-scheme": "light",
    "theme-color": "#ffffff",
  };
}

export default function ShippingMovedRoute() {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow max-w-sm w-full p-6">
        <div className="text-lg font-bold text-gr-black mb-2">Shipping moved</div>
        <p className="text-sm text-gray-700 mb-3">
          Shipping moved to the GoRoostr Shipping Room app on the shipping room Mac.
        </p>
        <p className="text-xs text-gray-500">If you need the old tool back, ask Greg.</p>
      </div>
    </main>
  );
}
