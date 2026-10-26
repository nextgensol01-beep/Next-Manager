import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  experimental: {
    // Custom UUID/fallback configuration opts out of the automatic build worker.
    webpackBuildWorker: true,
    // Bound build-time page/data workers on memory-constrained machines.
    cpus: 2,
  },
  serverExternalPackages: ["mongoose", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/quotation/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      uuid: path.resolve(__dirname, "vendor/uuid-safe/index.cjs"),
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/dashboard/quotation",
        destination: "/dashboard/quotations",
        permanent: true,
      },
    ];
  },
};

export default (phase) => ({
  ...nextConfig,
  // Keep local dev refreshes from overwriting a production build's manifests.
  // This generated directory is already covered by the existing ignore rules.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".artifacts/development/.next" : ".next",
});
