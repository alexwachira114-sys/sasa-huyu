---
name: DTrader BUY bridge
description: How the DTrader iframe delegates trade execution to the parent via postMessage
---

## Rule
DTrader runs in legacy mode by default, showing "Start trading with us" popup for PKCE users because it never receives valid auth. Fix requires two coordinated changes that both land in `dtrader-iframe/` (Vercel) + parent `iframe-wrapper.tsx` (Replit app).

**Root cause:** V2RootGate only enters bridge mode if `isV2Api()` is already true at mount — which it never is before the bridge runs. So `initBridge()` is never called, auth is never established, `is_logged_in` stays false.

**Fix 1 — `dtrader-iframe/src/App/Components/V2RootGate.jsx`:**  
Added `_isInIframe()` detection. When running inside an iframe, `forceV2=true` → status starts as 'loading' → `initBridge()` is called regardless of `isV2Api()`.

**Fix 2 — `src/components/iframe-wrapper/iframe-wrapper.tsx`:**  
Added `sendV2BridgeAuth()` that sends the exact `NewdtraderAuthMsg` schema (`type: 'deriv:dtrader:auth'`, `version: 'v2'`, with `activeAccountId`, `accounts[]`, `otpUrl`, `clientId`). Called on: iframe load, `deriv:dtrader:ready`, `deriv:dtrader:request-auth`. Has validity gate (defers if loginid/accounts not ready), source check (event.source === iframe.contentWindow), and strong type annotation.

**Fix 3 — `dtrader-iframe/src/_common/base/socket_base.js`:**  
`buy()` / `buyAndSubscribe()` detect `_inIframe()` and route trade execution via `BUY_REQUEST` postMessage to parent instead of `deriv_api.send`.

**Why:** PKCE users have no a1-xxx legacy token; DTrader's standard WS `authorize` fails. v2 bridge mode bypasses WS auth entirely — auth is synthetic from bridge data. `otpUrl` = standard Deriv WS (proposals work unauthenticated; buy is intercepted before hitting WS).

**How to apply:**
- `dtrader-iframe/` source must be built and deployed to Vercel for iframe-side changes to take effect
- Parent app changes (`iframe-wrapper.tsx`) are live in Replit dev/deployed app immediately
- Security: source checks on both sides; validity gate prevents empty-identity auth; 30s bridge timeout
- Legacy iframes (Hyperbot etc.) still use `AUTH_TOKEN` / `REQUEST_AUTH` path — not affected

## v1/v2 mutual exclusivity + storage stickiness (resolved by patch)
In the unpatched DTrader bundle, `v1` (no bridge auth, but no errors) and `v2` (bridge auth works, but `v2-websocket-wrapper.js` rewrote `symbol` → `underlying_symbol`, rejected by the real Deriv WS) were mutually exclusive — no URL param alone could get both working auth and working trades.
**Fix:** patched `v2-websocket-wrapper.js` to stop rewriting `symbol` → `underlying_symbol`, deployed to the DTrader Vercel project. Parent app now pins `api_version=v2` permanently in `dtrader.tsx`.
**Gotcha:** `setDerivApiVersion()` persists into both `sessionStorage` and `localStorage` on the DTrader origin, so a stale value can override intent — always pin the URL param explicitly (it wins over storage) rather than relying on absence of the param.
