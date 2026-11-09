import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "drizzle-orm"],
  outputFileTracingIncludes: {
    "/api/health": ["./drizzle/*.sql", "./drizzle/meta/_journal.json"],
  },
  outputFileTracingExcludes: {
    "/*": ["./.env*", "./.data/**/*", "./.test-data/**/*", "./.vercel/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
