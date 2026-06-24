/**
 * API base URL — reads from Vite env var so that:
 *  - Locally: '' (empty) → Vite dev proxy handles /api/* → localhost:8000
 *  - On Vercel: 'https://nl2app-compiler-backend.onrender.com' → calls Render directly
 *
 * This bypasses Vercel's proxy for API calls, which has timeout limits
 * that break long-running SSE streams (the compile pipeline takes 60-180s).
 */
export const API_BASE = import.meta.env.VITE_API_URL || ''
