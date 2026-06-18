import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  serverExternalPackages: ["mongoose", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/quotation/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      uuid: path.resolve(__dirname, "vendor/uuid-safe/index.cjs"),
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

export default nextConfig;
