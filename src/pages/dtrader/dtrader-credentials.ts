/**
 * DTrader credential resolution service.
 *
 * Responsible for producing a real Deriv WebSocket API token (a1-xxx) suitable
 * for DTrader's `authorize()` call, regardless of whether the user authenticated
 * via the legacy OAuth flow or the new PKCE flow.
 *
 * Architecture:
 *   resolveDTraderCredentials()
 *     └─ legacy user  → resolveLegacyToken()        (localStorage lookup)
 *     └─ PKCE user    → fetchLegacyTokensFromServer() → POST /oauth2/legacy/tokens
 *
 * resolveCurrency(loginId)     — looks up account currency, falls back to 'USD'
 * buildDTraderIframeUrl(creds) — pure URL builder, no auth logic
 */

import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DTraderCredentials = {
    loginId: string;
    /** Real Deriv WebSocket API token (a1-xxx). Never an OAuth JWT. */
    token: string;
    currency: string;
    appId: string;
};

export type CredentialResult =
    | { ok: true; credentials: DTraderCredentials }
    | {
          ok: false;
          /** TOKEN_INVALID is reserved for future use (e.g. iframe postMessage feedback). */
          state: 'AUTH_REQUIRED' | 'TOKEN_NOT_AVAILABLE' | 'PKCE_EXCHANGE_FAILED';
          detail?: string;
      };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Guards against loginid-as-token, OAuth JWTs, and other non-API-token values. */
const isRealApiToken = (t: unknown): t is string =>
    typeof t === 'string' &&
    t.startsWith('a1-') &&
    t !== 'null' &&
    t !== 'undefined';

/**
 * Checks localStorage for a valid a1-xxx token for the given loginId.
 * Only used for legacy (non-PKCE) auth users.
 */
function resolveLegacyToken(loginId: string): string | null {
    // 1. accountsList: { loginid: "a1-xxx" }
    try {
        const list = JSON.parse(localStorage.getItem('accountsList') || '{}');
        const direct = list[loginId];
        if (isRealApiToken(direct)) return direct;
        const key = Object.keys(list).find(k => k.toLowerCase() === loginId.toLowerCase());
        if (key && isRealApiToken(list[key])) return list[key];
    } catch (_) {}

    // 2. clientAccounts: { loginid: { token: "a1-xxx", ... } }
    try {
        const accs = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        const acc =
            accs[loginId] ??
            (Object.values(accs) as any[]).find(
                v => v?.loginid?.toLowerCase() === loginId.toLowerCase()
            );
        if (isRealApiToken((acc as any)?.token)) return (acc as any).token;
    } catch (_) {}

    // 3. Single authToken fallback
    try {
        const t = localStorage.getItem('authToken');
        if (isRealApiToken(t)) return t;
    } catch (_) {}

    return null;
}

/**
 * Calls GET /api/auth/legacy-tokens on the Express server.
 * The server reads the httpOnly `deriv_at` cookie (set during PKCE login) and
 * exchanges it with Deriv's OAuth2 legacy-token endpoint.
 * As a fallback the client-side NEW_AUTH_token is forwarded as an Authorization header
 * for cases where the cookie path hasn't been exercised.
 */
async function fetchLegacyTokensFromServer(oauthToken: string): Promise<unknown | null> {
    try {
        const res = await fetch('/api/auth/legacy-tokens', {
            method: 'GET',
            credentials: 'include', // send deriv_at httpOnly cookie
            headers: { Authorization: `Bearer ${oauthToken}` },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    }
}

/**
 * Extracts the first matching a1-xxx token from the legacy-tokens API response.
 * Handles the known response shapes returned by auth.deriv.com/oauth2/legacy/tokens.
 */
function extractTokenFromLegacyResponse(data: unknown, loginId: string): string | null {
    if (!data || typeof data !== 'object') return null;

    // Shape A: { accounts: [{ account_id, token }] }
    const accounts = (data as any).accounts;
    if (Array.isArray(accounts)) {
        const match =
            accounts.find(
                (a: any) =>
                    a.account_id === loginId ||
                    a.loginid === loginId
            ) ?? accounts[0];
        if (isRealApiToken(match?.token)) return match.token;
    }

    // Shape B: [{ loginid, token }]  (top-level array)
    if (Array.isArray(data)) {
        const match =
            (data as any[]).find(
                (a: any) => a.loginid === loginId || a.account_id === loginId
            ) ?? (data as any[])[0];
        if (isRealApiToken(match?.token)) return match.token;
    }

    // Shape C: { token: "a1-xxx" }  (flat single-account response)
    if (isRealApiToken((data as any).token)) return (data as any).token;

    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Looks up the currency for the given loginId.
 * Falls back to 'USD' if no currency can be determined.
 */
export function resolveCurrency(loginId: string): string {
    try {
        const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        if (clientAccounts[loginId]?.currency) return clientAccounts[loginId].currency;
    } catch (_) {}

    try {
        const accountData = JSON.parse(localStorage.getItem('accountList') || '[]');
        const acc = accountData.find((a: any) => a.loginid === loginId);
        if (acc?.currency) return acc.currency;
    } catch (_) {}

    return 'USD';
}

/**
 * Pure URL builder. Receives resolved credentials and returns the full iframe URL.
 * Contains no auth logic.
 */
export function buildDTraderIframeUrl(creds: DTraderCredentials): string {
    const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/dtrader';
    const params = new URLSearchParams({
        acct1: creds.loginId,
        token1: creds.token,
        cur1: creds.currency,
        lang: 'EN',
        app_id: creds.appId,
        chart_type: 'area',
        interval: '1t',
        symbol: '1HZ100V',
        trade_type: 'over_under',
        hide_bot: '1',
        bot_disabled: 'true',
        disable_bot: '1',
        no_bot: '1',
        manual_only: '1',
        hide_bot_controls: 'true',
    });
    return `${DTRADER_BASE}?${params.toString()}`;
}

/**
 * Resolves DTrader credentials for the currently active account.
 *
 * - Legacy users: reads a1-xxx token from localStorage (accountsList / clientAccounts / authToken).
 * - PKCE users:   exchanges the OAuth access token for legacy tokens via the Express server
 *                 (/api/auth/legacy-tokens → auth.deriv.com/oauth2/legacy/tokens).
 *
 * Returns a discriminated result — never throws.
 */
export async function resolveDTraderCredentials(): Promise<CredentialResult> {
    const loginId = getMainAppActiveLoginId();
    if (!loginId) {
        return { ok: false, state: 'AUTH_REQUIRED' };
    }

    const oauthToken =
        sessionStorage.getItem('NEW_AUTH_token') || localStorage.getItem('NEW_AUTH_token');
    const isPkceUser = !!oauthToken && oauthToken !== 'null';

    const currency = resolveCurrency(loginId);
    const appId = (getAppId() || 114292).toString();

    // ── Legacy auth path ────────────────────────────────────────────────────
    if (!isPkceUser) {
        const token = resolveLegacyToken(loginId);
        if (!token) {
            return { ok: false, state: 'TOKEN_NOT_AVAILABLE' };
        }
        return { ok: true, credentials: { loginId, token, currency, appId } };
    }

    // ── PKCE auth path ──────────────────────────────────────────────────────
    // Exchange the OAuth access token for legacy WebSocket API tokens via the
    // server-side proxy. This avoids passing the OAuth JWT directly to DTrader,
    // which would cause "Input validation failed: authorize".
    const legacyData = await fetchLegacyTokensFromServer(oauthToken);

    if (!legacyData) {
        return {
            ok: false,
            state: 'PKCE_EXCHANGE_FAILED',
            detail: 'Legacy token endpoint unreachable or returned an error.',
        };
    }

    const token = extractTokenFromLegacyResponse(legacyData, loginId);

    if (!token) {
        return {
            ok: false,
            state: 'TOKEN_NOT_AVAILABLE',
            detail: 'Legacy token exchange succeeded but no a1-xxx token was returned for this account.',
        };
    }

    return { ok: true, credentials: { loginId, token, currency, appId } };
}
