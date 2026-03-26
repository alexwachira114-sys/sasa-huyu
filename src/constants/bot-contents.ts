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
    ANALYSIS_TOOL: 4,
    STRATEGIES: 5,
    COPY_TRADING: 6,
    DTRADER: 7,
    TRADINGVIEW: 8,
    SPEEDBOT: 12,
    MAKOTI_MAGIC: 10,
    OVER_UNDER: 9,
    // Keep TUTORIAL as a non-active sentinel to avoid index mismatches in legacy checks
    TUTORIAL: 999,
    // Legacy tabs - kept for backward compatibility but redirect to TRADING_BOTS
    HYBRID_BOTS: 3,
    FREE_BOTS: 3,
    MATCHES: 3,
    HYPERBOT: 3,
    DIFFBOT: 3,
    DCIRCLES: 4,
    DP_TOOLS: 4,
    // Legacy SMART_TRADER redirects to STRATEGIES
    SMART_TRADER: 5,
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
    'id-dtrader',
    'id-tradingview',
    'id-speedbot',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
