import { setDerivApiVersion } from '@deriv/utils';

import { BridgeClient } from './bridge-client';
import { BridgeStorage } from './bridge-storage';
import type { NewdtraderAuthMsg } from './bridge-types';

type TInitBridgeOptions = {
    iframeVersion: string;
    timeoutMs?: number;
};

let activeClient: BridgeClient | null = null;
let cachedAuth: NewdtraderAuthMsg | null = null;

export async function initBridge(options: TInitBridgeOptions): Promise<NewdtraderAuthMsg> {
    activeClient?.stop();
    activeClient = new BridgeClient({ iframeVersion: options.iframeVersion });
    activeClient.start();

    const auth = await activeClient.waitForAuth(options.timeoutMs ?? 10000);
    BridgeStorage.write(auth);
    setDerivApiVersion('v2');
    cachedAuth = auth;

    return auth;
}

export function isBridgeReady() {
    return cachedAuth !== null;
}

export function getBridgeAuth() {
    if (cachedAuth && !BridgeStorage.isExpired()) return cachedAuth;
    cachedAuth = null;
    return null;
}

export async function refreshAuth(timeoutMs = 10000, expectedActiveAccountId?: string) {
    if (!activeClient) throw new Error('Bridge not initialised');

    activeClient.requestAuth();
    const auth = await activeClient.waitForAuth(
        timeoutMs,
        expectedActiveAccountId ? message => message.activeAccountId === expectedActiveAccountId : undefined
    );
    BridgeStorage.write(auth);
    cachedAuth = auth;

    return auth;
}

export function notifyReconnectFailed() {
    activeClient?.notifyReconnectFailed();
}

export function notifyNeedRelogin() {
    activeClient?.notifyNeedRelogin();
}

export function clearBridge() {
    activeClient?.stop();
    activeClient = null;
    cachedAuth = null;
    BridgeStorage.clear();
}

export type { NewdtraderAuthMsg } from './bridge-types';
export { normalizeV2Response } from './deriv-v2-normalize';
export { transformV2Request } from './deriv-v2-transform';
