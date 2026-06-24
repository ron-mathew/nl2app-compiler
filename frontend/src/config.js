/**
 * API base URL — auto-detected based on hostname:
 *  - Locally (localhost / 127.0.0.1): '' → Vite dev proxy handles /api/* → localhost:8000
 *  - On Vercel (or any non-local host): calls Render backend directly
 *
 * This bypasses Vercel's proxy for API calls, which has hard timeout limits
 * that kill long-running SSE streams (the pipeline takes 30-120 seconds).
 * No env var needed — works automatically in both environments.
 */
const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

export const API_BASE = isLocalDev ? '' : 'https://nl2app-compiler-backend.onrender.com'
