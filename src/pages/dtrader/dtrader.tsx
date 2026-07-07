import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveToken, getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';
import { isNewLoggedIn } from '@/auth/NewDerivAuth';
import NewDTrader from './NewDTrader';

const Dtrader = observer(() => {
    // ── ALL hooks must be called unconditionally before any early return ──
    const newAuth = isNewLoggedIn();

    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    const buildIframeUrl = useCallback((token: string, loginId: string) => {
        // PKCE users never reach this path — they get <NewDTrader /> below.
        const clientAccountsStr = localStorage.getItem('clientAccounts') || '{}';
        let currency = 'USD';
        try {
            const clientAccounts = JSON.parse(clientAccountsStr);
            const account = clientAccounts[loginId];
            if (account?.currency) {
                currency = account.currency;
            } else {
                const accountsListStr = localStorage.getItem('accountsList') || '{}';
                const accountsList = JSON.parse(accountsListStr);
                const accountInfo = Object.keys(accountsList).find(key => key === loginId);
                if (accountInfo) {
                    const accountData = JSON.parse(localStorage.getItem('accountList') || '[]');
                    const acc = accountData.find((a: any) => a.loginid === loginId);
                    if (acc?.currency) currency = acc.currency;
                }
            }
        } catch (error) {
            console.error('Error parsing clientAccounts:', error);
        }

        const appId = getAppId() || 114292;
        const params = new URLSearchParams({
            acct1: loginId,
            token1: token,
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

        setIframeSrc(`https://deriv-dtrader.vercel.app/dtrader?${params.toString()}`);
    }, []);

    useEffect(() => {
        if (newAuth) return; // PKCE users don't use the iframe path
        const token = getMainAppActiveToken();
        const activeLoginId = getMainAppActiveLoginId();

        if (token && activeLoginId) {
            setIsAuthenticated(true);
            buildIframeUrl(token, activeLoginId);
        } else {
            setIsAuthenticated(false);
            setIframeSrc('');
        }
    }, [buildIframeUrl, newAuth]);

    useEffect(() => {
        if (newAuth) return; // PKCE users don't use the iframe path

        const checkAuthAndUpdate = () => {
            const token = getMainAppActiveToken();
            const activeLoginId = getMainAppActiveLoginId();

            if (token && activeLoginId) {
                if (!isAuthenticated) setIsAuthenticated(true);
                buildIframeUrl(token, activeLoginId);
            } else if (isAuthenticated) {
                setIsAuthenticated(false);
                setIframeSrc('');
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

    // ── Routing (all hooks already called above) ──

    // PKCE / new-auth users: trade via OTP WebSocket inside NewDTrader.
    // There is no standard Deriv API token available to pass to an iframe
    // for these users — the OTP WebSocket IS their authenticated trading channel.
    if (newAuth) {
        return <NewDTrader />;
    }

    // Legacy users: must be authenticated to trade
    if (!isAuthenticated) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Please log in to use DTrader.</p>
            </div>
        );
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
