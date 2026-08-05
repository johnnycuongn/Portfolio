import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        port: '',
        pathname: '/johnnycuongn/**',
        search: '',
      },
    ],
  },
  outputFileTracingIncludes: {
    '/api/chat': ['./src/app/_ai/about-johnny.md'],
  },
};

export default nextConfig;
