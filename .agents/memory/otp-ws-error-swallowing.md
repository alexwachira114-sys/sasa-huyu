---
name: OTP WebSocket rejections swallowed into generic UI errors
description: sendViaNewSystemWithPromise (PKCE/OTP path) rejects with a plain object, not an Error — any caller that checks `instanceof Error` before showing the message will hide the real API error.
---

## Rule
`sendViaNewSystemWithPromise()` in `src/auth/NewDerivAuth.js` rejects its promise with a plain `{ error: {...}, echo_req }` object (from the WS `data.error` or a `DisconnectError`), never a JS `Error` instance.

Any trade/purchase code path for PKCE-logged-in users (`isNewLoggedIn() === true`) that awaits this call **must** catch the rejection and rethrow a real `Error` with `sendError?.error?.message`. If it doesn't, and the calling UI does `err instanceof Error ? err.message : 'generic fallback'`, the real Deriv error (insufficient balance, market closed, invalid barrier, etc.) is discarded and the user only ever sees the generic fallback string — making the actual failure reason invisible.

**Why:** Found via `src/pages/manual-trading/manual-trading.tsx`'s `handleManualPurchase`, which showed "Manual Trading could not purchase this contract." for every OTP-path failure regardless of cause. `buyContractForUi` in `src/utils/trade-purchase.ts` was calling `sendViaNewSystemWithPromise` for the PKCE buy path with no try/catch, so the raw rejection object propagated up untouched.

**How to apply:** When adding or auditing any new PKCE/OTP trade flow (buy, sell, proposal, etc.) that calls `sendViaNewSystemWithPromise`, wrap it in try/catch and normalize to `new Error(sendError?.error?.message || sendError?.message || fallback)` before it can reach UI code that gates on `instanceof Error`.
