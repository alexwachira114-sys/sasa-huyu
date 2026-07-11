---
name: Manual Trading Run Panel visibility
description: Why trades placed in Manual Trading didn't show in the Run Panel, and the pattern to check for similar bugs.
---

`main.tsx` renders `<RunPanel />` and `<RunStrategy />` inside per-tab exclusion lists
(`hash[active_tab] !== 'strategies' && ... && <RunPanel />`). The Manual Trading tab's
actual trade-recording code (`transactions.pushTransaction`, `run_panel.onBotContractEvent`,
`summary_card.onBotContractEvent` in `manual-trading.tsx`) was already correct and wired —
the bug was that `'manual_trading'` had been added to the exclusion list that hides
`RunPanel`, so trades were recorded into the stores but the panel showing them was never
rendered while that tab was active.

**Why:** These hand-maintained exclusion lists are easy to get wrong when a new tab is added —
excluding a tab from `RunStrategy` (the bot-builder config panel, correctly tab-specific) is
different from excluding it from `RunPanel` (which should generally stay visible across
trading tabs so users can see their transaction history).

**How to apply:** When a "transactions/trades aren't showing" bug is reported for a specific
tab, check the store-side event wiring first (usually already correct), then check
`main.tsx`'s per-tab visibility conditions for `RunPanel`/`RunStrategy` — the bug is often
there, not in the page component itself.

**Second gate inside RunPanel itself:** `main.tsx` only controls whether `<RunPanel />` is
mounted at all. `run-panel.tsx` has its OWN independent `show_run_panel` allowlist
(`[BOT_BUILDER, CHART, TRADING_BOTS, ANALYSIS_TOOL, ...].includes(active_tab)`) that returns
`null` on desktop if the active tab isn't in that array — regardless of what `main.tsx` does.
Adding a new tab (e.g. `MANUAL_TRADING`) requires updating BOTH: the `main.tsx` exclusion
list AND this `show_run_panel` array inside `run-panel.tsx`, or the panel silently never
renders on desktop even though nothing in `main.tsx` is hiding it.
