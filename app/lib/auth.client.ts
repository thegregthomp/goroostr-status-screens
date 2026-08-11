/**
 * Client-side auth helpers for shipping-work.
 *
 * Sanctum token stored in localStorage — this is an internal warehouse
 * tool served across a domain boundary (Netlify status-screens →
 * api.goroostr.com), so HttpOnly cookies would need cross-domain
 * plumbing. Bearer token in localStorage is the simplest workable
 * option for a trusted internal tool.
 *
 * All shipping-print calls (postage-billing) route through authFetch
 * to attach the token + surface 401s. Non-auth calls (rates, carriers,
 * pending-shipments listing) keep going to /api and don't need this.
 */

const TOKEN_KEY = "shipping.auth.token";
const USER_KEY = "shipping.auth.user";
const DEVICE_NAME = "pending-shipments-work";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

export const authClient = {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  getUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },
  setSession(token: string, user: AuthUser): void {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  },

  /**
   * POST /spa/sanctum/token — returns Sanctum token + user object.
   * Throws on invalid credentials or network error.
   */
  async login(
    spaEndpoint: string,
    email: string,
    password: string
  ): Promise<{ token: string; user: AuthUser }> {
    const resp = await fetch(`${spaEndpoint}/sanctum/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password, device_name: DEVICE_NAME }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const msg =
        (body?.errors?.email && body.errors.email[0]) ||
        body?.message ||
        `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const data = await resp.json();
    return {
      token: data.token,
      user: { id: data.user.id, name: data.user.name, email: data.user.email },
    };
  },
};

/**
 * Wrapped fetch that attaches Bearer + surfaces 401 by clearing session
 * and throwing a marker error. Callers should catch AuthRequiredError
 * and redirect to /login.
 */
export class AuthRequiredError extends Error {
  constructor() {
    super("auth required");
    this.name = "AuthRequiredError";
  }
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = authClient.getToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const resp = await fetch(url, { ...init, headers });
  if (resp.status === 401) {
    authClient.clear();
    throw new AuthRequiredError();
  }
  return resp;
}
