import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { V2GetActiveToken, V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { isNewLoggedIn } from '../../auth/NewDerivAuth';
import DTraderPanel from './DTraderPanel';
import './dtrader.scss';

function getTokenAndCurrency(): { token: string | null; currency: string } {
    const legacyToken = V2GetActiveToken();
    const loginId = V2GetActiveClientId();

    let currency = 'USD';
    if (loginId) {
        try {
            const accounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
            if (accounts[loginId]?.currency) {
                currency = accounts[loginId].currency;
            }
        } catch {}
    }

    if (legacyToken) {
        return { token: legacyToken, currency };
    }

    if (isNewLoggedIn()) {
        const newToken = localStorage.getItem('__new_auth_token');
        if (newToken) return { token: newToken, currency };
        return { token: '__new_auth__', currency };
    }

    return { token: null, currency };
}

const Dtrader = observer(() => {
    const [auth, setAuth] = useState(() => getTokenAndCurrency());

    useEffect(() => {
        const refresh = () => setAuth(getTokenAndCurrency());

        const handle = (e: StorageEvent) => {
            if (['authToken', 'active_loginid', 'clientAccounts', '__new_auth_token'].includes(e.key || '')) {
                refresh();
            }
        };

        window.addEventListener('storage', handle);
        return () => window.removeEventListener('storage', handle);
    }, []);

    return (
        <div className='dtrader'>
            <DTraderPanel token={auth.token} currency={auth.currency} />
        </div>
    );
});

export default Dtrader;
