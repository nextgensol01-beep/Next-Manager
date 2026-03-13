/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mongoose"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  eslint: {
    // ESLint warnings/errors won't block the production build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type errors won't block the production build
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
