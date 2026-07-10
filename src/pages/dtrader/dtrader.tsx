import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';

/**
 * Resolve a proper Deriv WebSocket API token (a1-xxx) for the given loginId.
 *
 * getMainAppActiveToken() is intentionally NOT used here because it returns
 * NEW_AUTH_token (PKCE OAuth bearer) first for new-auth users — that token
 * is rejected by DTrader's WebSocket authorize call.
 *
 * We try every localStorage key that may hold the real a1-xxx token,
 * falling back through them in order of reliability.
 */
const resolveApiToken = (loginId: string): string | null => {
    const isApiToken = (t: unknown) =>
        typeof t === 'string' && t.length > 4 && t !== 'null' && t !== 'undefined';

    // 1. accountsList: { loginid: "a1-xxx" }
    try {
        const list = JSON.parse(localStorage.getItem('accountsList') || '{}');
        // Try exact key, then case-insensitive scan
        const direct = list[loginId];
        if (isApiToken(direct)) return direct;
        const key = Object.keys(list).find(k => k.toLowerCase() === loginId.toLowerCase());
        if (key && isApiToken(list[key])) return list[key];
    } catch (_) {}

    // 2. clientAccounts: { loginid: { token: "a1-xxx", ... } }
    try {
        const accs = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        const acc = accs[loginId] ?? Object.values(accs).find((v: any) =>
            v?.loginid?.toLowerCase() === loginId.toLowerCase()
        );
        if (isApiToken((acc as any)?.token)) return (acc as any).token;
    } catch (_) {}

    // 3. client.accounts (used by some legacy flows)
    try {
        const accs = JSON.parse(localStorage.getItem('client.accounts') || '{}');
        const acc = accs[loginId];
        if (isApiToken(acc?.token)) return acc.token;
    } catch (_) {}

    // 4. authToken single-token fallback (legacy auth)
    try {
        const t = localStorage.getItem('authToken');
        if (isApiToken(t)) return t!;
    } catch (_) {}

    return null;
};

const Dtrader = observer(() => {
    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    const buildIframeUrl = useCallback((loginId: string) => {
        const token = resolveApiToken(loginId);

        if (!token) {
            // No valid API token — load DTrader without auth (it will show login)
            setIframeSrc(
                'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
            );
            setIsAuthenticated(false);
            return;
        }

        // Resolve currency from local account stores
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

        setIframeSrc(`https://deriv-dtrader.vercel.app/dtrader?${params.toString()}`);
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
