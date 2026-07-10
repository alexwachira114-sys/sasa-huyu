import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';

/**
 * DTrader tab
 *
 * Loads the Deriv DTrader UI via the project's own server-side proxy
 * (/dtrader-proxy → localhost:3001).  Auth is delivered through the
 * project's auth system — NOT embedded in the URL:
 *
 *   1. IframeWrapper sends AUTH_TOKEN { token, loginid, appId } via
 *      postMessage whenever the user logs in / switches accounts.
 *   2. The proxy injects an auth bridge script that listens for that
 *      message and writes the credentials into localStorage in the
 *      format DTrader expects (client.accounts / active_loginid).
 *   3. DTrader reads localStorage on boot and authenticates with the
 *      user's real Deriv account — same session as the rest of the project.
 *
 * DTrader handles its own charts, trade ticket, and trade history.
 */
const Dtrader = observer(() => (
    <IframeWrapper src='/dtrader-proxy' title='DTrader' className='dtrader-container' />
));

export default Dtrader;
