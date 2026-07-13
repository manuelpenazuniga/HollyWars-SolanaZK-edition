import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@solana/wallet-adapter-react", "@solana/wallet-adapter-react-ui"],
  webpack: (config, { isServer }) => {
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...config.resolve.modules,
    ];
    // snarkjs pulls node built-ins that don't exist in the browser bundle; stub them.
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        readline: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        constants: false,
        worker_threads: false,
      };
    }
    return config;
  },
  // ZK proving artifacts are content-addressed (regenerating the circuit changes the vkey,
  // which would fail on-chain) — cache them immutably at the CDN edge.
  async headers() {
    return [
      {
        source: "/zk/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
