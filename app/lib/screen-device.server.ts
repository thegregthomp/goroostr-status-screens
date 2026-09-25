import { createCookie, redirect } from "@remix-run/node";
import { timingSafeEqual } from "crypto";

/**
 * KAN-171 — TV wall access. The wall's data (ShipStation buyer names and
 * addresses) is loaded by this server, so the page itself has to know which
 * browsers are registered screens; the password prompt only ever ran in the
 * browser, after the data had been sent.
 *
 * Register a TV once by opening `/pending-shipments?device=<key>`. The key is
 * checked against STATUS_SCREENS_DEVICE_KEYS (comma-separated, one per TV,
 * 24+ chars) and kept in a long-lived httpOnly cookie. Revoke a TV by removing
 * its key from the env var.
 *
 * While STATUS_SCREENS_DEVICE_KEYS is unset the gate is open (warning logged),
 * so this can deploy before the keys are configured.
 */
const deviceCookie = createCookie("gr_screen_device", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
});

function allowedKeys(): string[] {
  return (process.env.STATUS_SCREENS_DEVICE_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 24);
}

function isAllowed(key: string, allowed: string[]): boolean {
  const given = Buffer.from(key);
  return allowed.some((k) => {
    const expected = Buffer.from(k);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

const NOT_REGISTERED =
  "This screen isn't registered. Open its registration link once (ask Greg for it).";

/** Throws a 403 (or a redirect that stores the device cookie) unless the request is from a registered screen. */
export async function requireScreenDevice(request: Request): Promise<void> {
  const allowed = allowedKeys();
  if (allowed.length === 0) {
    console.warn("STATUS_SCREENS_DEVICE_KEYS is unset — the TV wall is not device-gated");
    return;
  }

  const url = new URL(request.url);
  const fromUrl = url.searchParams.get("device");
  if (fromUrl !== null) {
    if (!isAllowed(fromUrl, allowed)) throw new Response(NOT_REGISTERED, { status: 403 });
    url.searchParams.delete("device");
    const qs = url.searchParams.toString();
    throw redirect(url.pathname + (qs ? `?${qs}` : ""), {
      headers: { "Set-Cookie": await deviceCookie.serialize(fromUrl) },
    });
  }

  const fromCookie = await deviceCookie.parse(request.headers.get("Cookie"));
  if (typeof fromCookie === "string" && isAllowed(fromCookie, allowed)) return;

  throw new Response(NOT_REGISTERED, { status: 403 });
}
