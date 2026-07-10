# DTrader Iframe — Bridge + Field-Naming Patch

This directory contains the DTrader iframe source (hosted separately at your Vercel instance).

## What was changed

**`src/_common/base/deriv_v2_adapter.js`** — removed the `symbol` → `underlying_symbol`
rewrite in `transformV2Request()`. This is the actual live send path: `socket_base.js`
wires it in as `DerivAPIBasic`'s `middleware.requestDataTransformer`, so every outgoing
request passes through it. The OTP URL this bridge connects to is the standard Deriv
WebSocket endpoint, which only ever accepts `symbol` on `proposal` and `buy.parameters`.
Sending `underlying_symbol` instead gets every proposal/buy request rejected with
`Input validation failed: Properties not allowed: underlying_symbol`, which disables
the Over/Under (and all other) trade buttons. Responses already keep both field names
via `FIELD_ALIASES`, so nothing else needs to change.

**`src/_common/base/v2-websocket-wrapper.js`** — same `symbol` → `underlying_symbol` bug,
fixed identically. `V2WrappedWebSocket` also transforms outgoing requests (it wraps the
raw `WebSocket` used once the OTP URL is active), so both this file and
`deriv_v2_adapter.js` needed the fix — patching only one left the bug live.

**`src/api-v2/src/iframe-bridge/deriv-v2-transform.ts`** — same bug in a third,
TypeScript-sourced copy of this transform (used by a parallel/newer bridge code path).
Fixed identically for consistency, even though it is not confirmed to be on the hot
path for this integration.

**`src/_common/base/socket_base.js`** — one surgical edit to `buy()` and `buyAndSubscribe()`.

When DTrader runs inside the parent iframe (detected via `window.self !== window.top`), the final trade execution step no longer calls `deriv_api.send({ buy, price })` directly. Instead it:

1. Generates a unique `reqId`
2. Posts `{ type: "BUY_REQUEST", reqId, payload }` to `window.parent`
3. Awaits `{ type: "BUY_RESULT", reqId, payload }` from the parent
4. Resolves or rejects the original Promise with the result

A 30-second timeout with guaranteed listener cleanup is included so a non-responsive parent never leaves a hung promise.

All proposal generation, UI, chart, market selection, and auth logic is **unchanged**.

## Parent-side counterpart

`src/components/iframe-wrapper/iframe-wrapper.tsx` in the main application handles `BUY_REQUEST` by:

1. Verifying the message came from the DTrader `contentWindow` (source check)
2. Validating `reqId`, `payload`, and required `buy`/`proposal_id`/`price` fields
3. Calling `sendViaNewSystemWithPromise(buyRequest)` — the existing PKCE-authenticated trade engine
4. Posting `BUY_RESULT` (success or error) back to the iframe
5. Mirroring the contract into the Run Panel transactions list

## Deploying

Build this directory using the existing DTrader build pipeline and deploy to your Vercel project.
The changed files relative to the original are:

```
src/_common/base/deriv_v2_adapter.js
src/_common/base/v2-websocket-wrapper.js
src/_common/base/socket_base.js
src/App/Components/V2RootGate.jsx
src/api-v2/src/iframe-bridge/deriv-v2-transform.ts
```

No new dependencies. No auth changes beyond the field-naming fix above.

## After deploying

Once this is live, wire the parent app's iframe URL back to `api_version=v2`
(revert the `api_version=v1` override in `src/pages/dtrader/dtrader.tsx`) so the
bridge auth path activates again — with this fix, trading will no longer be
rejected by the real Deriv WS.
