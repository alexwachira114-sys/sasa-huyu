import React, { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import {
    buildDTraderIframeUrl,
    resolveDTraderCredentials,
    type CredentialResult,
} from './dtrader-credentials';

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

type DTraderStatus =
    | 'LOADING'
    | 'AUTHENTICATED'
    | 'AUTH_REQUIRED'
    | 'TOKEN_NOT_AVAILABLE'
    /** Reserved for future use (e.g. iframe postMessage feedback on invalid token). */
    | 'TOKEN_INVALID'
    | 'PKCE_EXCHANGE_FAILED';

const STATUS_MESSAGES: Record<Exclude<DTraderStatus, 'LOADING' | 'AUTHENTICATED'>, string> = {
    AUTH_REQUIRED:
        'Please log in to use DTrader.',
    TOKEN_NOT_AVAILABLE:
        'No trading token found for this account. Try logging out and back in.',
    TOKEN_INVALID:
        'Your trading token appears to be invalid. Please re-authenticate.',
    PKCE_EXCHANGE_FAILED:
        'Could not retrieve trading credentials from Deriv. Please log out and log back in.',
};

// Keys whose changes should trigger a credential re-check
const WATCHED_STORAGE_KEYS = new Set([
    'accountsList',
    'authToken',
    'active_loginid',
    'clientAccounts',
    'show_as_cr',
    'NEW_AUTH_token',
]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Dtrader = observer(() => {
    const [status, setStatus] = useState<DTraderStatus>('LOADING');
    const [iframeSrc, setIframeSrc] = useState<string>('');

    const refresh = useCallback(async () => {
        setStatus('LOADING');

        const result: CredentialResult = await resolveDTraderCredentials();

        if (!result.ok) {
            if (result.detail) {
                console.warn('[DTrader] Credential resolution failed:', result.state, result.detail);
            }
            // result.state values are a strict subset of DTraderStatus — no cast needed
            const statusMap = {
                AUTH_REQUIRED: 'AUTH_REQUIRED',
                TOKEN_NOT_AVAILABLE: 'TOKEN_NOT_AVAILABLE',
                PKCE_EXCHANGE_FAILED: 'PKCE_EXCHANGE_FAILED',
            } as const satisfies Record<typeof result.state, DTraderStatus>;
            setStatus(statusMap[result.state]);
            return;
        }

        setIframeSrc(buildDTraderIframeUrl(result.credentials));
        setStatus('AUTHENTICATED');
    }, []);

    // Resolve credentials on mount
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Re-resolve on storage changes (cross-tab), window focus, and same-tab auth events.
    // Note: the browser `storage` event only fires in other tabs/documents, not the same tab
    // that wrote the key. For same-tab PKCE login NewDerivAuth.js dispatches 'new-system-balance'
    // via window.dispatchEvent after populating account data — we listen for that too.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === null || WATCHED_STORAGE_KEYS.has(e.key)) {
                refresh();
            }
        };
        const onFocus = () => refresh();
        const onNewSystemAuth = () => refresh();

        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', onFocus);
        // Fired by NewDerivAuth.js (src/auth/NewDerivAuth.js) after PKCE login
        // sets up accountsList / clientAccounts in the same tab
        window.addEventListener('new-system-balance', onNewSystemAuth);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('new-system-balance', onNewSystemAuth);
        };
    }, [refresh]);

    // ── Loading ─────────────────────────────────────────────────────────────
    if (status === 'LOADING') {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Loading DTrader...</p>
            </div>
        );
    }

    // ── Error states ─────────────────────────────────────────────────────────
    if (status !== 'AUTHENTICATED') {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>{STATUS_MESSAGES[status]}</p>
                <button onClick={refresh} style={{ marginTop: 12 }}>
                    Retry
                </button>
            </div>
        );
    }

    // ── Authenticated ────────────────────────────────────────────────────────
    return <IframeWrapper src={iframeSrc} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
