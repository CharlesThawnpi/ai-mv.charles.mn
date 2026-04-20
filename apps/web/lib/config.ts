// NEXT_PUBLIC_API_URL — available in both server and client components.
// Set in apps/web/.env.local for local dev (see root .env.example).
export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
