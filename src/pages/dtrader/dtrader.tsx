import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';

/**
 * Returns true when the user is on the new PKCE OAuth auth system.
 * New-auth users have no real a1-xxx Deriv WebSocket API tokens in
 * localStorage — NewDerivAuth.js stores the loginId as the token
 * value, which DTrader rejects as "invalid token".
 */
const isNewAuthUser = (): boolean => {
    try {
        const t = localStorage.getItem('NEW_AUTH_token') || sessionStorage.getItem('NEW_AUTH_token');
        return !!t && t !== 'null';
    } catch (_) {
        return false;
    }
};

/**
 * Resolve a proper Deriv WebSocket API token (a1-xxx) for legacy auth users.
 * Only called when isNewAuthUser() is false.
 */
const resolveApiToken = (loginId: string): string | null => {
    // A real Deriv API token starts with "a1-" and is never equal to the loginId
    const isRealToken = (t: unknown): t is string =>
        typeof t === 'string' &&
        t.startsWith('a1-') &&
        t !== loginId &&
        t !== 'null' &&
        t !== 'undefined';

    // 1. accountsList: { loginid: "a1-xxx" }
    try {
        const list = JSON.parse(localStorage.getItem('accountsList') || '{}');
        const direct = list[loginId];
        if (isRealToken(direct)) return direct;
        const key = Object.keys(list).find(k => k.toLowerCase() === loginId.toLowerCase());
        if (key && isRealToken(list[key])) return list[key];
    } catch (_) {}

    // 2. clientAccounts: { loginid: { token: "a1-xxx", ... } }
    try {
        const accs = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        const acc = accs[loginId] ?? Object.values(accs).find(
            (v: any) => v?.loginid?.toLowerCase() === loginId.toLowerCase()
        );
        if (isRealToken((acc as any)?.token)) return (acc as any).token;
    } catch (_) {}

    // 3. authToken single-token fallback
    try {
        const t = localStorage.getItem('authToken');
        if (isRealToken(t)) return t!;
    } catch (_) {}

    return null;
};

const Dtrader = observer(() => {
    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    const buildIframeUrl = useCallback((loginId: string) => {
        const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/dtrader';
        const CLEAN_URL = `${DTRADER_BASE}?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under`;

        // Pick the best available token:
        // 1. New-auth users → use NEW_AUTH_token (project's own OAuth token)
        // 2. Legacy users   → use a1-xxx from accountsList / clientAccounts
        let token: string | null = null;

        if (isNewAuthUser()) {
            token =
                localStorage.getItem('NEW_AUTH_token') ||
                sessionStorage.getItem('NEW_AUTH_token');
        }

        if (!token) {
            token = resolveApiToken(loginId);
        }

        if (!token) {
            setIframeSrc(CLEAN_URL);
            setIsAuthenticated(false);
            return;
        }

        // Resolve currency
        let currency = 'USD';
        try {
            const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
            if (clientAccounts[loginId]?.currency) {
                currency = clientAccounts[loginId].currency;
            } else {
                const accountData = JSON.parse(localStorage.getItem('accountList') || '[]');
                const acc = accountData.find((a: any) => a.loginid === loginId);
                if (acc?.currency) currency = acc.currency;
            }
        } catch (_) {}

        const appId = getAppId() || 114292;

        const params = new URLSearchParams({
            acct1:             loginId,
            token1:            token,
            cur1:              currency,
            lang:              'EN',
            app_id:            appId.toString(),
            chart_type:        'area',
            interval:          '1t',
            symbol:            '1HZ100V',
            trade_type:        'over_under',
            hide_bot:          '1',
            bot_disabled:      'true',
            disable_bot:       '1',
            no_bot:            '1',
            manual_only:       '1',
            hide_bot_controls: 'true',
        });

        setIframeSrc(`${DTRADER_BASE}?${params.toString()}`);
        setIsAuthenticated(true);
    }, []);

    useEffect(() => {
        const loginId = getMainAppActiveLoginId();
        if (loginId) {
            buildIframeUrl(loginId);
        } else {
            setIframeSrc(
                'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
            );
        }
    }, [buildIframeUrl]);

    // Re-check whenever auth state or account changes
    useEffect(() => {
        const checkAndUpdate = () => {
            const loginId = getMainAppActiveLoginId();
            if (loginId) {
                buildIframeUrl(loginId);
            } else if (isAuthenticated) {
                setIsAuthenticated(false);
                setIframeSrc(
                    'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
                );
            }
        };

        const handleStorageChange = (e: StorageEvent) => {
            if (
                e.key === 'accountsList' ||
                e.key === 'authToken' ||
                e.key === 'active_loginid' ||
                e.key === 'clientAccounts' ||
                e.key === 'show_as_cr'
            ) {
                checkAndUpdate();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const interval = setInterval(checkAndUpdate, 2000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [isAuthenticated, buildIframeUrl]);

    if (!iframeSrc) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Loading DTrader...</p>
            </div>
        );
    }

    return <IframeWrapper src={iframeSrc} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
