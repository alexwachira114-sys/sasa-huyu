export const BRIDGE_MESSAGE_TYPES = {
    READY: 'deriv:dtrader:ready',
    REQUEST_AUTH: 'deriv:dtrader:request-auth',
    RECONNECT_FAILED: 'deriv:dtrader:reconnect-failed',
    NEED_RELOGIN: 'deriv:dtrader:need-relogin',
    AUTH: 'deriv:dtrader:auth',
    AUTH_ERROR: 'deriv:dtrader:auth-error',
} as const;

export const LEGACY_BRIDGE_MESSAGE_TYPES = {
    READY: 'newdtrader:ready',
    REQUEST_AUTH: 'newdtrader:request-auth',
    RECONNECT_FAILED: 'newdtrader:reconnect-failed',
    NEED_RELOGIN: 'newdtrader:need-relogin',
    AUTH: 'newdtrader:auth',
    AUTH_ERROR: 'newdtrader:auth-error',
} as const;

export interface DerivV2Account {
    account_id: string;
    balance?: string;
    currency: string;
    group?: string;
    status?: string;
    account_type: 'demo' | 'real';
}

export interface DerivV2UserProfile {
    country?: string;
    local_currencies?: Record<string, unknown>;
    currency?: string;
    email?: string;
    fullname?: string;
}

export interface NewdtraderAuthInfo {
    access_token: string;
    token_type: 'Bearer';
    expires_at: number;
}

export interface NewdtraderReadyMsg {
    type: typeof BRIDGE_MESSAGE_TYPES.READY;
    iframeVersion: string;
}

export interface NewdtraderRequestAuthMsg {
    type: typeof BRIDGE_MESSAGE_TYPES.REQUEST_AUTH;
}

export interface NewdtraderReconnectFailedMsg {
    type: typeof BRIDGE_MESSAGE_TYPES.RECONNECT_FAILED;
}

export interface NewdtraderNeedReloginMsg {
    type: typeof BRIDGE_MESSAGE_TYPES.NEED_RELOGIN;
}

export type IframeToParentMsg =
    | NewdtraderReadyMsg
    | NewdtraderRequestAuthMsg
    | NewdtraderReconnectFailedMsg
    | NewdtraderNeedReloginMsg;

export interface NewdtraderAuthMsg {
    type: typeof BRIDGE_MESSAGE_TYPES.AUTH | typeof LEGACY_BRIDGE_MESSAGE_TYPES.AUTH;
    version: 'v2';
    auth: NewdtraderAuthInfo;
    activeAccountId: string;
    accounts: DerivV2Account[];
    otpUrl: string;
    userProfile: DerivV2UserProfile;
    clientId: string;
    apiBase: string;
    authBase: string;
    branding?: Record<string, string>;
}

export interface NewdtraderAuthErrorMsg {
    type: typeof BRIDGE_MESSAGE_TYPES.AUTH_ERROR | typeof LEGACY_BRIDGE_MESSAGE_TYPES.AUTH_ERROR;
    error: string;
}

export type ParentToIframeMsg = NewdtraderAuthMsg | NewdtraderAuthErrorMsg;

export const isAuthMsg = (message: unknown): message is NewdtraderAuthMsg => {
    if (!message || typeof message !== 'object') return false;

    const data = message as Record<string, unknown>;

    return (
        (data.type === BRIDGE_MESSAGE_TYPES.AUTH || data.type === LEGACY_BRIDGE_MESSAGE_TYPES.AUTH) &&
        data.version === 'v2' &&
        !!data.auth &&
        typeof data.activeAccountId === 'string' &&
        Array.isArray(data.accounts) &&
        typeof data.otpUrl === 'string' &&
        typeof data.clientId === 'string'
    );
};

export const isAuthErrorMsg = (message: unknown): message is NewdtraderAuthErrorMsg => {
    if (!message || typeof message !== 'object') return false;

    const data = message as Record<string, unknown>;
    return (
        (data.type === BRIDGE_MESSAGE_TYPES.AUTH_ERROR || data.type === LEGACY_BRIDGE_MESSAGE_TYPES.AUTH_ERROR) &&
        typeof data.error === 'string'
    );
};
