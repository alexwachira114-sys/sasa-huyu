import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveToken, getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';
import { isNewLoggedIn, createNewWebSocket } from '@/auth/NewDerivAuth';
import NewDTrader from './NewDTrader';

const Dtrader = observer(() => {
    // Determine auth mode first — but ALL hooks must be called unconditionally
    // before any early return (Rules of Hooks).
    const newAuth = isNewLoggedIn();

    // For PKCE users: track whether the OTP trading socket is open.
    // We poll every 500 ms until window._newSystemWSReady is true.
    const [otpReady, setOtpReady] = useState<boolean>(() => !!(window as any)._newSystemWSReady);

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

    // Poll until the OTP WebSocket is open, then stop. Also kick off
    // createNewWebSocket() if App.tsx hasn't done it yet (e.g. fast nav).
    useEffect(() => {
        if (!newAuth) return;
        if ((window as any)._newSystemWSReady) { setOtpReady(true); return; }

        // Trigger connection if it hasn't started yet
        if (!(window as any)._newSystemWS) {
            createNewWebSocket();
        }

        const poll = setInterval(() => {
            if ((window as any)._newSystemWSReady) {
                setOtpReady(true);
                clearInterval(poll);
            }
        }, 500);

        return () => clearInterval(poll);
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

    // New-auth users: wait for the OTP trading socket before rendering.
    // Without this, handleBuyContract fires while window._newSystemWS is null
    // → sendViaNewSystem returns false → isTrading hangs on "Buying..." forever.
    if (newAuth) {
        if (!otpReady) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#ccc' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid #444', borderTop: '3px solid #4caf50', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '14px' }}>Connecting trading socket…</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            );
        }
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
