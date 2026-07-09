import React, { useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import './dtrader.scss';

function getAuthPayload() {
    const accountsList: { loginid: string; token: string; currency: string }[] = [];
    let activeLoginid = '';

    try {
        const raw = localStorage.getItem('clientAccounts') || localStorage.getItem('client.accounts') || '{}';
        const accounts = JSON.parse(raw);
        Object.entries(accounts).forEach(([loginid, info]: [string, any]) => {
            if (info?.token) {
                accountsList.push({ loginid, token: info.token, currency: info.currency || 'USD' });
            }
        });
    } catch {}

    try {
        activeLoginid =
            localStorage.getItem('active_loginid') ||
            localStorage.getItem('activeLoginid') ||
            '';
    } catch {}

    if (!activeLoginid && accountsList.length > 0) {
        activeLoginid = accountsList[0].loginid;
    }

    return { accountsList, activeLoginid };
}

const Dtrader = observer(() => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const sendAuth = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        const payload = getAuthPayload();
        iframe.contentWindow.postMessage(
            { type: 'DT_AUTH_DATA', payload },
            window.location.origin
        );
    }, []);

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.source !== iframeRef.current?.contentWindow) return;
            if (e.data?.type === 'DT_REQUEST_AUTH') {
                sendAuth();
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [sendAuth]);

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (
                ['clientAccounts', 'client.accounts', 'active_loginid', 'activeLoginid',
                 'authToken', '__new_auth_token'].includes(e.key || '')
            ) {
                sendAuth();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [sendAuth]);

    return (
        <div className='dtrader-embed'>
            <iframe
                ref={iframeRef}
                src='/dtrader-proxy'
                className='dtrader-embed__frame'
                title='Deriv DTrader'
                allow='clipboard-write'
                onLoad={sendAuth}
            />
        </div>
    );
});

export default Dtrader;
