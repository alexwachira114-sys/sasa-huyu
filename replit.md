# MakotiTraders — Professional Deriv trading bot builder and copy trading dashboard

## Run & Operate
- **Dev server**: `npm run start` (runs on port 5000)
- **Build**: `npm run build` → outputs to `dist/`
- **Test**: `npm test`
- **Required env vars** (optional, analytics/translations only): `TRANSLATIONS_CDN_URL`, `R2_PROJECT_NAME`, `CROWDIN_BRANCH_NAME`, `TRACKJS_TOKEN`, `APP_ENV`, `DATADOG_*`, `RUDDERSTACK_KEY`, `GROWTHBOOK_*`

## Stack
- React 18 + TypeScript, rsbuild (RSPack-based bundler)
- MobX for state management, SCSS/Sass for styling
- `@deriv-com/auth-client` for Deriv OIDC auth (URL-param token flow)
- `@deriv/deriv-api` for WebSocket API communication
- Blockly for visual bot builder
- Node 20.x

## Where things live
- `src/main.tsx` — app entry point
- `src/app/` — routing, auth wrapper, app bootstrap
- `src/pages/` — page-level features (main dashboard, callback, endpoint)
- `src/components/` — UI components (layout, header, modals, bot builder)
- `src/external/bot-skeleton/` — Deriv API/WebSocket abstraction
- `src/stores/` — MobX stores
- `src/hooks/` — custom hooks
- `src/utils/supabase.ts` — Supabase client (copy trading token storage)
- `rsbuild.config.ts` — build config (entry, aliases, server config)
- `index.html` — HTML template (rsbuild injects bundles automatically)

## Architecture decisions
- Uses rsbuild (not Webpack/Vite) — bundler config is in `rsbuild.config.ts`
- Auth is Deriv's own OIDC flow via URL params (tokens come back in the URL after login redirect); no Replit Auth replacement needed
- Supabase is used as a data store for copy trading tokens, not for authentication
- Firebase is used only for remote config (country allow-lists), with a local fallback
- `historyApiFallback: true` enables SPA routing in dev mode

## Product
- Visual trading bot builder (Blockly-based)
- Copy trading (follow/replicate other traders)
- Live charts, trading signals, over/under tools
- Free bots library with XML bot definitions
- Multi-account support via Deriv's account switcher

## User preferences
- Port 5000, host 0.0.0.0 for Replit preview pane
- `pluginBasicSsl` disabled (Replit handles TLS)

## Gotchas
- Do NOT add `<script type="module" src="/src/main.tsx">` to `index.html` — rsbuild injects the bundle script automatically
- `source.alias` is deprecated in rsbuild v1.7+; use `resolve.alias` instead (warning only, doesn't break build)
- Black screen on load is expected when not authenticated with Deriv — the app requires a Deriv account login

## Pointers
- rsbuild docs: https://rsbuild.dev/
- Deriv API: https://api.deriv.com/
