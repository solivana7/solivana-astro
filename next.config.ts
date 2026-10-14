import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["swisseph", "@resvg/resvg-js"],
}

export default nextConfig
