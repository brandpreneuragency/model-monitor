import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: [
    "@model-monitor/database",
    "@model-monitor/schemas",
    "@model-monitor/ui",
    "@model-monitor/csv-import",
  ],
  serverExternalPackages: ["drizzle-orm", "postgres"],
};

export default config;
