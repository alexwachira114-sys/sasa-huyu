type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    TRADING_BOTS: 3,
    OVER_UNDER: 4,      // DOM position 4 in main.tsx
    CAXYNEXUS_AI_MAGIC: 5,    // DOM position 5 in main.tsx
    ANALYSIS_TOOL: 6,   // DOM position 6 in main.tsx
    STRATEGIES: 7,      // DOM position 7 in main.tsx
    COPY_TRADING: 8,    // DOM position 8 in main.tsx
    SMART_TRADER: 9,    // DOM position 9 in main.tsx
    TRADINGVIEW: 10,    // DOM position 10 in main.tsx
    DERIV_API: 11,      // DOM position 11 in main.tsx
    SPEEDBOT: 12,
    // Keep TUTORIAL as a non-active sentinel to avoid index mismatches in legacy checks
    TUTORIAL: 999,
    // Legacy tabs - kept for backward compatibility but redirect to TRADING_BOTS
    HYBRID_BOTS: 3,
    FREE_BOTS: 3,
    MATCHES: 3,
    HYPERBOT: 3,
    DIFFBOT: 3,
    DCIRCLES: 6,
    DP_TOOLS: 6,
    // Legacy SMART_TRADER redirects to STRATEGIES
    SMART_TRADER: 7,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-trading-bots',
    'id-analysis-tool',
    'id-strategies',
    'id-copy-trading',
    'id-smart-trader',
    'id-tradingview',
    'id-speedbot',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
