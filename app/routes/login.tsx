import { json, type LoaderArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import { authClient } from "~/lib/auth.client";

/**
 * Sign-in page for the shipping-work dashboard (2026-08-11).
 *
 * Ops types email + password → POST /spa/sanctum/token → token stored
 * in localStorage → redirect to whatever they were trying to reach
 * (defaults to /pending-shipments-work). Reuses the existing
 * Sanctum-based user pool — no separate credentials to manage.
 */

export function meta() {
  return {
    title: "Sign in — Shipping",
    "color-scheme": "light",
    "theme-color": "#ffffff",
  };
}

export async function loader({ request }: LoaderArgs) {
  // Derive both API + SPA endpoints from the same base env var
  // (GOROOSTR_ENDPOINT = https://api.goroostr.com/api) so we don't
  // need a second Netlify env var.
  const api = process.env.GOROOSTR_ENDPOINT ?? "";
  const spa = api.replace(/\/api\/?$/, "") + "/spa";
  return json({ spaEndpoint: spa });
}

export default function LoginRoute() {
  const { spaEndpoint } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/pending-shipments-work";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, punch through to next.
  useEffect(() => {
    if (authClient.getToken()) navigate(next, { replace: true });
  }, [navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await authClient.login(spaEndpoint, email, password);
      authClient.setSession(token, user);
      navigate(next, { replace: true });
    } catch (e) {
      setError((e as Error).message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow max-w-sm w-full p-6">
        <div className="text-lg font-bold text-gr-black mb-1">Sign in</div>
        <div className="text-xs text-gray-500 mb-4">
          Shipping work — actions are audited by user.
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-600 block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-600 block mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2 rounded bg-gr-green-dark text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
