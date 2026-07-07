import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveToken, getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';
import { isNewLoggedIn } from '@/auth/NewDerivAuth';
import NewDTrader from './NewDTrader';

const Dtrader = observer(() => {
    // Determine auth mode first — but ALL hooks must be called unconditionally
    // before any early return (Rules of Hooks).
    const newAuth = isNewLoggedIn();

    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    const buildIframeUrl = useCallback((token: string, loginId: string) => {
        // Skip work for new-auth users — they get NewDTrader, not the iframe.
        if (newAuth) return;

        const clientAccountsStr = localStorage.getItem('clientAccounts') || '{}';
        let currency = 'USD';

        try {
            const clientAccounts = JSON.parse(clientAccountsStr);
            const account = clientAccounts[loginId];
            if (account?.currency) {
                currency = account.currency;
            }
        } catch (error) {
            console.error('Error parsing clientAccounts:', error);
        }

        const appId = getAppId() || 114292;
        const effectiveToken = token || loginId;

        const params = new URLSearchParams({
            acct1: loginId,
            token1: effectiveToken,
            cur1: currency,
            lang: 'EN',
            app_id: appId.toString(),
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

        const url = `https://deriv-dtrader.vercel.app/dtrader?${params.toString()}`;
        setIframeSrc(url);
    }, [newAuth]);

    useEffect(() => {
        // No iframe work needed for new-auth users.
        if (newAuth) return;

        const token = getMainAppActiveToken();
        const activeLoginId = getMainAppActiveLoginId();

        if (activeLoginId && token) {
            setIsAuthenticated(true);
            buildIframeUrl(token, activeLoginId);
        } else if (activeLoginId) {
            setIsAuthenticated(true);
            buildIframeUrl(activeLoginId, activeLoginId);
        } else {
            setIsAuthenticated(false);
            setIframeSrc(
                'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
            );
        }
    }, [buildIframeUrl, newAuth]);

    useEffect(() => {
        // No polling needed for new-auth users.
        if (newAuth) return;

        const checkAuthAndUpdate = () => {
            const token = getMainAppActiveToken();
            const activeLoginId = getMainAppActiveLoginId();

            if (activeLoginId && token) {
                if (!isAuthenticated) {
                    setIsAuthenticated(true);
                }
                buildIframeUrl(token, activeLoginId);
            } else if (activeLoginId) {
                if (!isAuthenticated) {
                    setIsAuthenticated(true);
                }
                buildIframeUrl(activeLoginId, activeLoginId);
            } else if (isAuthenticated) {
                setIsAuthenticated(false);
                setIframeSrc(
                    'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
                );
            }
        };

        const handleStorageChange = (e: StorageEvent) => {
            if (
                e.key === 'authToken' ||
                e.key === 'active_loginid' ||
                e.key === 'clientAccounts' ||
                e.key === 'accountsList' ||
                e.key === 'show_as_cr' ||
                e.key === 'NEW_AUTH_token'
            ) {
                checkAuthAndUpdate();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const interval = setInterval(checkAuthAndUpdate, 2000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [isAuthenticated, buildIframeUrl, newAuth]);

    // New-auth users: render the fully functional custom trading interface.
    // It connects directly via the OTP WebSocket so trades work immediately.
    if (newAuth) {
        return <NewDTrader />;
    }

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
