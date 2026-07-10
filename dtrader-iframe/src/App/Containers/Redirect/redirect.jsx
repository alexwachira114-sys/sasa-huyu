import { useEffect, useState } from 'react';
import { useHistory, withRouter } from 'react-router-dom';
import Cookies from 'js-cookie';
import PropTypes from 'prop-types';

import { useTMB } from '@deriv/hooks';
import { getDomainName, routes } from '@deriv/shared';
import { observer, useStore } from '@deriv/stores';
import { requestOidcAuthentication } from '@deriv-com/auth-client';

const Redirect = observer(() => {
    const history = useHistory();
    const { client, ui } = useStore();
    const [queryCurrency, setQueryCurrency] = useState('USD');
    const is_deriv_com = /deriv\.(com)/.test(window.location.hostname) || /localhost:8443/.test(window.location.host);
    const { isTmbEnabled } = useTMB();

    const {
        authorize_accounts_list,
        is_client_store_initialized,
        setVerificationCode,
        setNewEmail,
        setPreventRedirectToHub,
        switchAccount,
        verification_code,
    } = client;

    const {
        setResetTradingPasswordModalOpen,
        setRedirectFromEmail,
        toggleResetPasswordModal,
        toggleResetEmailModal,
        toggleUpdateEmailModal,
    } = ui;

    const url_query_string = window.location.search;
    const url_params = new URLSearchParams(url_query_string);
    let redirected_to_route = false;

    // Migrate cookies to localStorage (OS subdomain login)
    const client_accounts = Cookies.get('client.accounts');
    const active_loginid = Cookies.get('active_loginid');
    const active_wallet_loginid = Cookies.get('active_wallet_loginid');

    if (client_accounts && active_loginid) {
        localStorage.setItem('client.accounts', client_accounts);
        localStorage.setItem('active_loginid', active_loginid);
        localStorage.setItem('active_wallet_loginid', active_wallet_loginid);

        const domain = getDomainName();
        Cookies.remove('client.accounts', { domain, secure: true });
        Cookies.remove('active_loginid', { domain, secure: true });
        Cookies.remove('active_wallet_loginid', { domain, secure: true });

        if (url_params.get('action') === 'redirect') {
            window.location.href = window.location.origin + url_params.get('redirect_to');
        }
        window.location.reload();
    }

    const action_param = url_params.get('action');
    const code_param = url_params.get('code') || verification_code[action_param];

    setVerificationCode(code_param, action_param);
    setNewEmail(url_params.get('email'), action_param);

    switch (action_param) {
        case 'reset_password': {
            setPreventRedirectToHub(true);
            toggleResetPasswordModal(true);
            break;
        }
        case 'request_email': {
            setPreventRedirectToHub(true);
            toggleResetEmailModal(true);
            break;
        }
        case 'social_email_change': {
            setPreventRedirectToHub(true);
            toggleResetPasswordModal(true);
            break;
        }
        case 'system_email_change': {
            setPreventRedirectToHub(true);
            toggleUpdateEmailModal(true);
            break;
        }
        case 'trading_platform_mt5_password_reset':
        case 'trading_platform_dxtrade_password_reset': {
            const reset_code_key = `${action_param}_code`;
            if (!verification_code[action_param]) {
                const reset_code = sessionStorage.getItem(reset_code_key);
                setVerificationCode(reset_code, action_param);
                sessionStorage.removeItem(reset_code_key);
            }
            setPreventRedirectToHub(true);
            setResetTradingPasswordModalOpen(true);
            break;
        }
        case 'phone_number_verification': {
            setRedirectFromEmail(true);
            history.push(routes.trade);
            redirected_to_route = true;
            break;
        }
        default:
            break;
    }

    useEffect(() => {
        const account_currency = url_params.get('account');
        setQueryCurrency(account_currency);
    }, []);

    useEffect(() => {
        const checkTmbAndRedirect = async () => {
            const is_tmb_enabled = await isTmbEnabled();
            const account_currency = queryCurrency;

            if (!redirected_to_route && is_client_store_initialized) {
                const client_account_lists = JSON.parse(localStorage.getItem('client.accounts') || '{}');

                const length_of_authorize_accounts_list = authorize_accounts_list.length;
                const length_of_client_account_lists = Object.keys(client_account_lists).length;
                const should_retrigger_oidc = length_of_authorize_accounts_list !== length_of_client_account_lists;

                // Map trade types from redirect params to trade route
                const trade_type_mappings = [
                    { pattern: /accumulator/i, route: routes.trade, type: 'accumulator' },
                    { pattern: /turbos/i, route: routes.trade, type: 'turboslong' },
                    { pattern: /vanilla/i, route: routes.trade, type: 'vanillalongcall' },
                    { pattern: /multiplier/i, route: routes.trade, type: 'multiplier' },
                ];

                const matched_route = trade_type_mappings.find(({ pattern }) =>
                    pattern.test(url_query_string || history.location.search)
                );

                let updated_search = url_query_string;
                const params = new URLSearchParams(url_query_string);
                params.set('account', queryCurrency);
                params.set('trade_type', matched_route?.type);
                if (matched_route?.type) {
                    updated_search = params.toString();
                }

                if (should_retrigger_oidc && authorize_accounts_list.length > 0 && is_deriv_com && !is_tmb_enabled) {
                    try {
                        requestOidcAuthentication({
                            redirectCallbackUri: `${window.location.origin}/callback`,
                            postLoginRedirectUri: `redirect?${updated_search}`,
                        }).catch(err => {
                            // eslint-disable-next-line no-console
                            console.error(err);
                        });
                    } catch (err) {
                        // eslint-disable-next-line no-console
                        console.error(err);
                    }
                }

                if (account_currency && !is_tmb_enabled) {
                    let matching_loginid;
                    const converted_account_currency = account_currency.toUpperCase();

                    if (converted_account_currency === 'DEMO') {
                        matching_loginid = Object.keys(client_account_lists).find(loginid => /^VR/.test(loginid));
                    } else {
                        matching_loginid = Object.keys(client_account_lists).find(
                            loginid =>
                                client_account_lists[loginid].currency?.toUpperCase() === converted_account_currency &&
                                client_account_lists[loginid].account_category === 'trading' &&
                                !client_account_lists[loginid]?.is_virtual
                        );
                    }

                    if (matching_loginid && is_client_store_initialized) {
                        switchAccount(matching_loginid);
                        sessionStorage.setItem('active_loginid', matching_loginid);
                    }
                }

                history.push({
                    pathname: matched_route ? matched_route.route : routes.trade,
                    search: updated_search,
                });
            }
        };

        checkTmbAndRedirect();
    }, [redirected_to_route, url_query_string, history, is_client_store_initialized, authorize_accounts_list]);

    return null;
});

Redirect.propTypes = {
    history: PropTypes.object,
};

export default withRouter(Redirect);
