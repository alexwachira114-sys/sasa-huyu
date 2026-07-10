import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { useStore } from '@/hooks/useStore';

const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/dtrader';

/**
 * Build the DTrader URL with non-sensitive configuration only.
 *
 * No token is included in the URL — authentication is handled exclusively
 * by IframeWrapper's AUTH_TOKEN postMessage, which sends the OAuth session
 * to the iframe after it loads and whenever the session changes.
 *
 * Deriv OAuth 2.0 PKCE produces an OAuth access token (Bearer JWT).
 * DTrader's WebSocket authorize() expects a legacy a1-xxx API token.
 * Passing an OAuth JWT as token1 causes "Input validation failed: authorize".
 * The postMessage bridge (AUTH_TOKEN) is the correct auth boundary.
 */
function buildDTraderUrl(loginId: string, currency: string): string {
    const params = new URLSearchParams({
        acct1:             loginId,
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
        // Force v2. The deployed DTrader bundle has been patched (see
        // dtrader-iframe/README-BRIDGE-PATCH.md) to stop rewriting
        // `symbol` -> `underlying_symbol` in v2-websocket-wrapper.js, so the
        // v2 bridge-auth path (required for our postMessage AUTH_TOKEN to be
        // accepted) no longer breaks proposal/buy requests. getDerivApiVersion()
        // resolves as: URL `?api_version` > sessionStorage > localStorage > 'v1',
        // so pinning 'v2' here overrides any stale stored value.
        api_version:       'v2',
    });
    return `${DTRADER_BASE}?${params.toString()}`;
}

/**
 * DTrader tab — wired into the same authentication state as all other tabs.
 *
 * Auth source : ClientStore (populated by the PKCE flow via CoreStoreProvider).
 * Auth bridge : IframeWrapper sends { type: "AUTH_TOKEN", token, loginid, appId }
 *               via postMessage on iframe load and on every auth-state change.
 *               No token appears in the iframe URL.
 *
 * MobX observer → re-renders automatically when client.is_logged_in /
 * client.loginid / client.currency change; no polling or storage listeners needed.
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

    const loginId  = client.loginid;
    const currency = client.currency || 'USD';

    const src = loginId
        ? buildDTraderUrl(loginId, currency)
        : `${DTRADER_BASE}?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under&api_version=v2`;

    return <IframeWrapper src={src} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
