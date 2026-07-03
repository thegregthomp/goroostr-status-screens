import type {
  LinksFunction,
  LoaderArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

import tailwindStylesheetUrl from "./styles/tailwind.css";

export const meta: MetaFunction = () => {
  return { title: "GoRoostr — Order Status" };
};

export const links: LinksFunction = () => {
  return [
    { rel: "stylesheet", href: tailwindStylesheetUrl },
    // Brand icon in the tab. Full-color SVG works on modern browsers and
    // scales cleanly on Retina tabs; falls back to /favicon.ico on Safari.
    { rel: "icon", type: "image/svg+xml", href: "/GR_Logo1B.svg" },
    // DM Sans (brand typography per goroostr.com/brand). Preconnect keeps
    // the initial paint fast; display=swap avoids blank-text flicker.
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;900&display=swap",
    },
  ];
};

export async function loader({ request }: LoaderArgs) {
  return json({});
};

export default function App() {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full font-sans text-gr-black bg-white">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
