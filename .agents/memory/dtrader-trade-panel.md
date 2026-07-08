---
name: DTrader self-contained trade panel
description: Architecture decisions for replacing the DTrader iframe with a real WS-connected trade execution UI.
---

## Architecture

All files live under `src/pages/dtrader/`:
- `trade-ws.ts` — TradeWSManager (dual-path WS layer)
- `trade-execution-store.ts` — MobX store (single source of truth)
- `DTraderPanel.tsx` — main layout component
- `components/` — MarketSelector, ContractTypeSelector, TradeParameters, PurchaseButtons, OpenPositions
- `dtrader.tsx` — thin page wrapper (reads token + currency from localStorage)
- `dtrader.scss` — comprehensive BEM styles (dt-* prefix)

## WS Dual-Path

**New auth (PKCE/OTP):**
- Check `window._newSystemWS?.readyState === WebSocket.OPEN`
- Attach `addEventListener('message', ...)` to `window._newSystemWS` for receiving
- For sending, inline `convertToNewFormat(data)` then `window._newSystemWS.send(JSON.stringify(...))`
- `convertToNewFormat`: `symbol → underlying_symbol` for proposals; `buy → String(buy)` for purchases

**Legacy auth:**
- `V2GetActiveToken()` returns the token; `getAppId()` from `@/components/shared` returns the app ID
- Connect to `wss://<server>/websockets/v3?app_id=<appId>&l=EN&brand=deriv`
- Authorize with `{ authorize: token }` on open before any trade calls

**Why:** The existing `api_base` proxy only works after bot-skeleton initializes, which doesn't happen if the user goes directly to DTrader. A dedicated WS manager avoids the dependency.

## Subscription Pattern

The store tracks `proposalUnsubs[]` (cleanup functions). Each proposal subscription:
1. Sends `{ proposal: 1, subscribe: 1, ..., req_id }` via `rawSend`
2. A `globalHandlers` capture function matches by `req_id`, extracts `subscription.id`, then routes future messages by sub ID
3. Cleanup: call the returned function which calls `{ forget: subId }` and removes from `subHandlers` map

## Token Retrieval for New Auth Users

`isNewLoggedIn()` from `NewDerivAuth.js` detects new auth. When true, `V2GetActiveToken()` returns null. The store passes `'__new_auth__'` as a sentinel — the TradeWSManager uses `window._newSystemWS` in that case and skips the authorize call.

## Contract Types Supported

Rise/Fall (CALL/PUT), Digits (Over/Under, Even/Odd, Match/Differ), Touch/No Touch. Duration unit auto-adjusts by trade type (ticks-only for Rise/Fall + Digits; minutes+ for Touch).
