import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';

/**
 * Resolve a proper Deriv WebSocket API token (a1-xxx) for the given loginId.
 *
 * getMainAppActiveToken() is intentionally NOT used here because it returns
 * the NEW_AUTH_token (PKCE OAuth bearer) for new-auth users, which DTrader
 * cannot use for the WebSocket `authorize` call — that causes
 * "Input validation failed: authorize".
 *
 * accountsList stores  { loginId: "a1-xxx..." }  which is the correct token.
 */
const resolveApiToken = (loginId: string): string | null => {
    try {
        const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
        const token = accountsList[loginId];
        if (token && token !== 'null') return token;
    } catch (_) {}

    // Legacy fallback: authToken key used by older auth flow
    try {
        const authToken = localStorage.getItem('authToken');
        if (authToken && authToken !== 'null') return authToken;
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
