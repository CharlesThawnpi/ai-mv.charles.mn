/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ai-mv/shared", "@ai-mv/core", "@ai-mv/i18n"],

  // NEXT_PUBLIC_API_URL is embedded at build time for client-side use.
  // API_BASE_URL is available server-side only (server components / route handlers).
  // Set both in apps/web/.env.local for local dev (see root .env.example).
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
