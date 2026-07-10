import type { NewdtraderAuthMsg } from './bridge-types';

const KEYS = {
    AUTH_INFO: 'v2_auth_info',
    ACCOUNTS: 'v2_accounts',
    ACTIVE_ACCOUNT_ID: 'v2_active_account_id',
    USER_PROFILE: 'v2_user_profile',
    CLIENT_ID: 'v2_client_id',
    API_BASE: 'v2_api_base',
    AUTH_BASE: 'v2_auth_base',
} as const;

export const WS_URL_KEY = 'v2_ws_url';
const BRANDING_SECRET_KEY = 'bt_secret';
const BRANDING_SECRET_VALUE = 'binarytool';

const toLegacyAccountShape = (message: NewdtraderAuthMsg) =>
    message.accounts.reduce<Record<string, Record<string, unknown>>>((accounts, account) => {
        accounts[account.account_id] = {
            currency: account.currency,
            is_virtual: account.account_type === 'demo' ? 1 : 0,
            loginid: account.account_id,
            token: message.auth.access_token,
        };

        return accounts;
    }, {});

const safe = <T>(fn: () => T, fallback: T): T => {
    try {
        return fn();
    } catch {
        return fallback;
    }
};

export const BridgeStorage = {
    write(message: NewdtraderAuthMsg) {
        if (typeof sessionStorage === 'undefined') return;

        sessionStorage.setItem(KEYS.AUTH_INFO, JSON.stringify(message.auth));
        sessionStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(message.accounts));
        sessionStorage.setItem(KEYS.ACTIVE_ACCOUNT_ID, message.activeAccountId);
        sessionStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(message.userProfile));
        sessionStorage.setItem(KEYS.CLIENT_ID, message.clientId);
        sessionStorage.setItem(KEYS.API_BASE, message.apiBase);
        sessionStorage.setItem(KEYS.AUTH_BASE, message.authBase);
        sessionStorage.setItem(WS_URL_KEY, message.otpUrl);
        if (message.branding?.[BRANDING_SECRET_KEY] === BRANDING_SECRET_VALUE) {
            sessionStorage.setItem(BRANDING_SECRET_KEY, BRANDING_SECRET_VALUE);
        }

        localStorage.setItem('active_loginid', message.activeAccountId);
        sessionStorage.setItem('active_loginid', message.activeAccountId);
        localStorage.setItem('client.accounts', JSON.stringify(toLegacyAccountShape(message)));
    },

    read(): NewdtraderAuthMsg | null {
        return null;
    },

    isExpired() {
        if (typeof sessionStorage === 'undefined') return true;

        const auth_raw = sessionStorage.getItem(KEYS.AUTH_INFO);
        if (!auth_raw) return true;

        const auth = safe(() => JSON.parse(auth_raw), null) as { expires_at?: number } | null;
        if (!auth?.expires_at) return true;

        return auth.expires_at < Date.now();
    },

    clear() {
        if (typeof sessionStorage === 'undefined') return;

        Object.values(KEYS).forEach(key => sessionStorage.removeItem(key));
        sessionStorage.removeItem(WS_URL_KEY);
        sessionStorage.removeItem(BRANDING_SECRET_KEY);
    },
};
