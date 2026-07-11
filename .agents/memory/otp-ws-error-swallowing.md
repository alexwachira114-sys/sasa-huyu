---
name: OTP WebSocket rejections swallowed into generic UI errors
description: sendViaNewSystemWithPromise (PKCE/OTP path) rejects with a plain object, not Error — any `instanceof Error` gate hides the real message. Also covers the symbol vs underlying_symbol schema requirement on this same path.
---

## Rejection shape
`sendViaNewSystemWithPromise()` in `src/auth/NewDerivAuth.js` rejects its promise with a plain `{ error: {...}, echo_req }` object (from the WS `data.error` or a `DisconnectError`), never a JS `Error` instance.

Any trade/purchase code path for PKCE-logged-in users (`isNewLoggedIn() === true`) that awaits this call must catch the rejection and rethrow a real `Error` with `sendError?.error?.message`, or a UI that does `err instanceof Error ? err.message : 'generic fallback'` will discard the real Deriv error and only show the generic fallback.

## `symbol` vs `underlying_symbol` — do not "fix" this again
Deriv's official `proposal_request` and `buy_request` JSON schemas are `additionalProperties: false` and require the field **`underlying_symbol`** — there is no `symbol` property in either schema. The rest of the app (proposal builders, manual trading, speedbot) constructs requests using `symbol` (matching the legacy `deriv-api` npm SDK, which accepts/translates `symbol` internally for OAuth sessions). But requests sent raw over the OTP WebSocket (via `sendViaNewSystemWithPromise`/`api_base`'s override) bypass that SDK translation entirely.

**Fix (current, correct):** `convertToNewFormat()` in `NewDerivAuth.js` renames `symbol` → `underlying_symbol` (top-level, and inside a nested `parameters` object) right before sending over the OTP WS. This is the single choke point — every OTP send (manual trading proposals/buys via the `api_base.send` override, speedbot, iframe-wrapper BUY bridge) passes through it, so fix it there, not per-caller.

**Why this matters:** a previous session inverted this — it assumed the OTP WS *rejects* `underlying_symbol` and forced `symbol` through unchanged. That was backwards and caused every OTP-path proposal/buy to fail with "Input validation failed: Properties not allowed: symbol" (silently, for proposals wrapped in try/catch with a local fallback preview — so the UI still "looked fine" while every buy failed with a generic error). Verified against Deriv's live schema at `https://developers.deriv.com/schemas/buy_request.schema.json` and `proposal_request.schema.json` before concluding which direction is correct — do that again if this is ever in doubt, don't guess from error text alone.

**How to apply:** Never hardcode `underlying_symbol` into request builders — keep building with `symbol` everywhere, and let `convertToNewFormat` do the rename for the OTP path only. If validation errors mention a field once absent from these renamed keys, check the live schema JSON before changing direction.
