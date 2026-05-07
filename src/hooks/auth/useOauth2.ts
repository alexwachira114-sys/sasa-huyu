import { useState } from 'react';
import { useEffect } from 'react';
import Cookies from 'js-cookie';
import RootStore from '@/stores/root-store';
import { handleOidcAuthFailure } from '@/utils/auth-utils';
import { Analytics } from '@deriv-com/analytics';
import { OAuth2Logout } from '@deriv-com/auth-client';

/**
 * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, and `isSingleLoggingIn`.
 *
 * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app.
 *
 * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token.
 *
 * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in.
 *
 * The `handleLogout` argument is an optional function that will be called after logging out the user.
 * If `handleLogout` is not provided, the function will resolve immediately.
 *
 * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property.
 * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean }}
 */
export const useOauth2 = ({
    handleLogout,
    client,
}: {
    handleLogout?: () => Promise<void>;
    client?: RootStore['client'];
} = {}) => {
    const [isSingleLoggingIn, setIsSingleLoggingIn] = useState(false);
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    const isClientAccountsPopulated = Object.keys(accountsList).length > 0;
    const isSilentLoginExcluded =
        window.location.pathname.includes('callback') || window.location.pathname.includes('endpoint');

    const loggedState = Cookies.get('logged_state');

    useEffect(() => {
        window.addEventListener('unhandledrejection', event => {
            if (event?.reason?.error?.code === 'InvalidToken') {
                setIsSingleLoggingIn(false);
            }
        });
    }, []);

    useEffect(() => {
        const willEventuallySSO = loggedState === 'true' && !isClientAccountsPopulated;
        const willEventuallySLO = loggedState === 'false' && isClientAccountsPopulated;

        if (!isSilentLoginExcluded && (willEventuallySSO || willEventuallySLO)) {
            setIsSingleLoggingIn(true);
        } else {
            setIsSingleLoggingIn(false);
        }
    }, [isClientAccountsPopulated, loggedState, isSilentLoginExcluded]);

    const logoutHandler = async () => {
        client?.setIsLoggingOut(true);

        try {
            const domain = window.location.hostname.split('.').slice(-2).join('.');

            try {
                Cookies.set('logged_state', 'false', { domain: '.' + domain, expires: 0, path: '/', secure: window.location.protocol === 'https:' });
                Cookies.set('logged_state', 'false', { domain: window.location.hostname, expires: 0, path: '/', secure: window.location.protocol === 'https:' });
                Cookies.remove('logged_state', { domain: '.' + domain, path: '/' });
                Cookies.remove('logged_state', { domain: window.location.hostname, path: '/' });
            } catch { /* cookie ops can fail silently */ }

            try {
                const keysToRemove = [
                    'active_loginid', 'accountsList', 'authToken', 'clientAccounts',
                    'show_as_cr', 'adminMirrorModeEnabled', 'adminRealAccountUsingDemo',
                    'adminRealAccountDisplayLoginId', 'adminSwitchingFromRealTab',
                    'cr_loginid', 'fullAccountsList', 'client.accounts', 'client.country',
                    'callback_token',
                ];
                keysToRemove.forEach(k => localStorage.removeItem(k));
            } catch { /* localStorage can fail silently */ }

            try { sessionStorage.clear(); } catch { /* sessionStorage can fail silently */ }

            try { Analytics.reset(); } catch { /* analytics may not be configured */ }

            try {
                if (client) {
                    client.account_list = [];
                    client.accounts = {};
                    client.is_logged_in = false;
                    client.loginid = '';
                    client.balance = '0';
                    client.currency = 'USD';
                    client._all_accounts_balance = null;
                }
            } catch { /* client state reset can fail silently */ }

            OAuth2Logout({
                redirectCallbackUri: `${window.location.origin}/callback`,
                WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()),
                postLogoutRedirectUri: window.location.origin,
            }).catch(() => {});

            client?.logout().catch(() => {});
        } catch { /* safety net — nothing should block the redirect below */ }

        window.location.replace('/');
    };
    const retriggerOAuth2Login = async () => {
        try {
            const { generateOAuthURL } = await import('@/components/shared');
            window.location.replace(generateOAuthURL());
        } catch (error) {
            handleOidcAuthFailure(error);
        }
    };

    return { oAuthLogout: logoutHandler, retriggerOAuth2Login, isSingleLoggingIn };
};
