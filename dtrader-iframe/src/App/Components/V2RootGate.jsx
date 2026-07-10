import React from 'react';

import { initBridge, notifyNeedRelogin, notifyReconnectFailed } from '@deriv/api-v2';
import { Loading } from '@deriv/components';
import { isV2Api } from '@deriv/utils';

class V2RenderErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        // eslint-disable-next-line no-console
        console.error('[V2RootGate] child crash — requesting iframe reload:', error?.message ?? error);
        try {
            notifyReconnectFailed();
        } catch (_) {
            // postMessage to parent may fail if not in iframe context
        }
    }

    render() {
        if (this.state.hasError) return <Loading />;
        return this.props.children;
    }
}

const BinarySocket = require('../../_common/base/socket_base');
const { applyV2AuthToClientStore } = require('../../_common/base/deriv_v2_adapter');

const IFRAME_VERSION = process.env.IFRAME_VERSION || '1.0.0';

const V2RootGate = ({ children, root_store }) => {
    const [status, setStatus] = React.useState(isV2Api() ? 'loading' : 'ready');

    React.useEffect(() => {
        if (!isV2Api()) return undefined;

        try {
            sessionStorage.removeItem('v2_ws_url');
        } catch {
            // ignore storage failures in embedded/private contexts
        }

        let cancelled = false;

        initBridge({
            iframeVersion: IFRAME_VERSION,
            timeoutMs: 30000,
        })
            .then(() => {
                if (cancelled) return;

                applyV2AuthToClientStore(root_store?.client);

                try {
                    BinarySocket.closeAndOpenNewConnection?.();
                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.warn('[NewdtraderBridge] failed to reconnect core socket:', error);
                }

                setStatus('ready');
            })
            .catch(error => {
                if (cancelled) return;
                // eslint-disable-next-line no-console
                console.error('[NewdtraderBridge] auth failed:', error);
                setStatus('error');
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (status === 'ready') return <V2RenderErrorBoundary>{children}</V2RenderErrorBoundary>;

    if (status === 'error') {
        return (
            <div className='app-root__loading'>
                <p>Session expired</p>
                <button type='button' onClick={() => notifyNeedRelogin()}>
                    Log in again
                </button>
            </div>
        );
    }

    return <Loading />;
};

export default V2RootGate;
