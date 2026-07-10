import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import './dtrader.scss';

/**
 * DTrader tab — renders the public DTrader UI via our server-side proxy.
 *
 * The proxy (/dtrader-proxy, rsbuild → localhost:3001) does three things:
 *   1. Strips X-Frame-Options / CSP so the iframe loads cleanly.
 *   2. Injects a window.top patch so the Deriv React app thinks it is
 *      the top-level window (neutralises anti-clickjack code).
 *   3. Injects a WebSocket interceptor that forwards buy / settlement
 *      events to the parent via postMessage.
 *
 * IframeWrapper handles the rest:
 *   • Sends AUTH_TOKEN (token + loginid + appId) to the iframe on load
 *     and whenever auth changes, so DTrader trades on behalf of the
 *     logged-in account.
 *   • Listens for TRADE_PLACED / CONTRACT_EVENT postMessages from the
 *     iframe and records them in the transactions / run_panel stores.
 */
const Dtrader = observer(() => (
    <IframeWrapper
        src='/dtrader-proxy'
        title='DTrader'
        className='dtrader-iframe'
    />
));

export default Dtrader;
