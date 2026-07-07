---
name: DTrader PKCE trading fix
description: Why PKCE users need NewDTrader not the iframe, and what breaks if you remove that path.
---

## Rule
`dtrader.tsx` MUST check `isNewLoggedIn()` first and render `<NewDTrader />` for PKCE users. Do NOT replace this with an iframe-only approach.

**Why:** PKCE users have no standard Deriv OAuth token (`V2GetActiveToken()` intentionally returns null when `NEW_AUTH_token` exists). The DTrader iframe requires `token1=<real_oauth_token>` to place trades. Without it the iframe loads (public data/chart) but all trade attempts fail silently. `<NewDTrader />` uses `window._newSystemWS` (OTP WebSocket) which IS the PKCE trading channel.

**How to apply:** Any time dtrader.tsx is edited or replaced, verify the first routing check is:
```tsx
if (isNewLoggedIn()) return <NewDTrader />;
```
All hooks (useState, useCallback, useEffect) must appear BEFORE this early return — sasa-huyu's version has a Rules-of-Hooks violation here; always fix it.

## Legacy iframe path
Only build the iframe URL when BOTH real token AND loginId are present:
```tsx
if (token && activeLoginId) { buildIframeUrl(token, activeLoginId); }
```
Never use loginId as a fake token fallback — it produces a non-trading iframe session.

## Confirmed by
Both sasa-huyu and RoyalDdbOt reference projects. Royal's approach (api_base) also fails PKCE users because api_base is never authorized for them.
