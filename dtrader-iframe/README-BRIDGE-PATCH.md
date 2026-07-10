# DTrader Iframe — BUY_REQUEST Bridge Patch

This directory contains the DTrader iframe source (hosted separately at your Vercel instance).

## What was changed

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
The only changed file relative to the original is:

```
src/_common/base/socket_base.js
```

No new dependencies. No auth changes. No WebSocket changes.
