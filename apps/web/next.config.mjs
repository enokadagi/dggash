/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@awiknet/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1",
    NEXT_PUBLIC_APP_NAME: "AWIK NET",
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
  },
};

export default nextConfig;
