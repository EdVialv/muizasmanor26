import type { NextConfig } from "next";

/**
 * Day 21: staff pages and endpoints are personal. Besides the per-response
 * headers set by src/proxy.ts and the route handlers, mark them here too,
 * so a shared cache or a search engine never keeps one - even if a future
 * route forgets.
 */
const PRIVATE_HEADERS = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/admin", headers: PRIVATE_HEADERS },
      { source: "/admin/:path*", headers: PRIVATE_HEADERS },
      { source: "/api/admin/:path*", headers: PRIVATE_HEADERS },
    ];
  },
};

export default nextConfig;
