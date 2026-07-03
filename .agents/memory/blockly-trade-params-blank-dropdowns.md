---
name: Blank Market/Trade Type/Contract Type dropdowns in Bot Builder
description: Race condition where trade_definition_market/tradetype/contracttype dropdowns render blank on bot XML load if active_symbols data isn't ready yet.
---

The "1. Trade parameters" block's Market, Trade Type, and Contract Type dropdowns populate via a chain reaction: `trade_definition_market`'s `BLOCK_CREATE` handler populates MARKET_LIST, which fires a synthetic `BLOCK_CHANGE`, which cascades through SUBMARKET_LIST -> SYMBOL_LIST -> TRADETYPECAT_LIST -> TRADETYPE_LIST -> TYPE_LIST (each field's `updateOptions()` always fires a change event, per `scratch/hooks/field.js`).

If `ApiHelpers.instance.active_symbols` hasn't finished fetching data (`processed_symbols` still empty) at the exact moment the market block is created — e.g. bot XML loaded immediately on navigation, before the socket/symbols are ready — the chain runs with empty options and the dropdowns render fully blank (no text, just carets).

**Why:** The app already has a self-heal for this on account-switch/reconnect (`app-store.ts` `registerOnAccountSwitch`): it re-fetches active symbols then fires a fake `BlockCreate` event on all `trade_definition_market` blocks to re-trigger the population chain. That reaction only runs on socket-open events, not on generic/first bot XML loads (e.g. the Free Bots library "load into Bot Builder" flow).

**How to apply:** When bot XML is loaded programmatically into the workspace outside of the normal account-switch flow, replicate the same repair: after `load()` resolves, call `ApiHelpers.instance.active_symbols.retrieveActiveSymbols()` then re-fire a synthetic `BlockCreate` (via `runIrreversibleEvents`) on every `trade_definition_market` block in the workspace to force dropdowns to repopulate. See `src/pages/bot-builder/workspace-wrapper.tsx` (`repopulateTradeParameterDropdowns`) for the pattern used for the Free Bots load handoff.
