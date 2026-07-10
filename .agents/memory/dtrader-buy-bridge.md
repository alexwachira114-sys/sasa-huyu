---
name: DTrader BUY bridge
description: How the DTrader iframe delegates trade execution to the parent via postMessage
---

## Rule
DTrader's WS.buy() / WS.buyAndSubscribe() detect iframe context (window.self !== window.top) and postMessage BUY_REQUEST to parent instead of calling deriv_api.send. Parent IframeWrapper handles it, calls sendViaNewSystemWithPromise, replies with BUY_RESULT.

**Why:** The DTrader iframe cannot use the PKCE-authenticated OTP WebSocket directly — only the parent app holds that session. Delegating via postMessage lets the iframe keep its full proposal/UI logic while the parent executes the trade.

**How to apply:**
- Modified file in iframe source: `dtrader-iframe/src/_common/base/socket_base.js` (buy + buyAndSubscribe functions)
- Modified file in parent: `src/components/iframe-wrapper/iframe-wrapper.tsx` (BUY_REQUEST handler block)
- Security: parent checks `event.source === iframe.contentWindow` before accepting BUY_REQUEST
- Security: iframe checks `event.source === window.parent` before accepting BUY_RESULT
- Timeout: 30s in _buyViaParent with guaranteed listener cleanup
- Payload mapping: iframe sends `{ buy: proposal_id, price }` OR `{ proposal_id, price }`; parent normalises both to `{ buy, price }` before sendViaNewSystemWithPromise
- The DTrader iframe source is in `dtrader-iframe/` — deploy that directory to Vercel separately
