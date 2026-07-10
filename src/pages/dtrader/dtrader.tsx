import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { getMainAppActiveToken } from '@/external/bot-skeleton/services/api/appId';
import { useStore } from '@/hooks/useStore';

const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/dtrader';

/** Pure URL builder — receives already-resolved values, builds nothing else. */
function buildDTraderUrl(loginId: string, token: string, currency: string): string {
    const params = new URLSearchParams({
        acct1:             loginId,
        token1:            token,
        cur1:              currency,
        lang:              'EN',
        app_id:            (getAppId() || 114292).toString(),
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
    return `${DTRADER_BASE}?${params.toString()}`;
}

/**
 * DTrader tab — wired into the same authentication state as all other tabs.
 *
 * Auth source: ClientStore (populated by the PKCE flow via CoreStoreProvider).
 * Token source: getMainAppActiveToken() — same function used by IframeWrapper
 *   for its AUTH_TOKEN postMessage injection.
 *
 * Because this component is an MobX observer, it re-renders automatically
 * when client.is_logged_in / client.loginid / client.currency change —
 * no manual polling or storage-event listeners required.
 */
const Dtrader = observer(() => {
    const { client } = useStore();

    if (!client.is_logged_in) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Please log in to use DTrader.</p>
            </div>
        );
    }

    const token    = getMainAppActiveToken();
    const loginId  = client.loginid;
    const currency = client.currency || 'USD';

    const src =
        token && loginId
            ? buildDTraderUrl(loginId, token, currency)
            : `${DTRADER_BASE}?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under`;

    return <IframeWrapper src={src} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
