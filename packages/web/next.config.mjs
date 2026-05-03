/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API base URL is read at build/runtime via NEXT_PUBLIC_API_URL.
  // Default fallback (localhost:3001) is hard-coded in src/lib/api.ts so dev
  // works out of the box.
};

export default nextConfig;
