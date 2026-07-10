const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const getAppId = require('@deriv/shared').getAppId;
const getSocketURL = require('@deriv/shared').getSocketURL;
const cloneObject = require('@deriv/shared').cloneObject;
const getPropertyValue = require('@deriv/shared').getPropertyValue;
const State = require('@deriv/shared').State;
const { getLanguage } = require('@deriv/translations');
const { isV2Api } = require('@deriv/utils');
const website_name = require('@deriv/shared').website_name;
const SocketCache = require('./socket_cache');
const APIMiddleware = require('./api_middleware');
const { applyV2AuthToClientStore, buildV2AuthorizeResponse, buildV2AuthorizeStub, normalizeV2Response } = require('./deriv_v2_adapter');
const { V2WrappedWebSocket } = require('./v2-websocket-wrapper');

/*
 * An abstraction layer over native javascript WebSocket,
 * which provides additional functionality like
 * reopen the closed connection and process the buffered requests
 */
const BinarySocketBase = (() => {
    let deriv_api, binary_socket, client_store;

    let config = {};
    let wrong_app_id = 0;
    let is_disconnect_called = false;
    let is_connected_before = false;
    let is_switching_socket = false;

    const availability = {
        is_up: true,
        is_updating: false,
        is_down: false,
    };

    const getSocketUrl = (language, is_mock_server = false) => {
        if (is_mock_server) {
            return 'ws://127.0.0.1:42069';
        }
        const v2_ws_url = sessionStorage.getItem('v2_ws_url');
        if (isV2Api() && v2_ws_url) {
            return v2_ws_url;
        }
        return `wss://${getSocketURL()}/websockets/v3?app_id=${getAppId()}&l=${language}&brand=${website_name.toLowerCase()}`;
    };

    const isReady = () => hasReadyState(1);

    const isClose = () => !binary_socket || hasReadyState(2, 3);

    const blockRequest = value => deriv_api?.blockRequest(value);

    const emitSyntheticResponse = response => {
        if (!response?.msg_type) return;

        const expected_response = deriv_api?.expect_response_types?.[response.msg_type];
        if (expected_response?.isPending?.()) {
            expected_response.resolve(response);
        }

        State.set(['response', response.msg_type], cloneObject(response));
        config.wsEvent('message');
        if (typeof config.onMessage === 'function') {
            config.onMessage(response);
        }
    };

    const close = () => {
        binary_socket.close();
    };

    const closeAndOpenNewConnection = (language = getLanguage(), session_id = '') => {
        close();
        is_switching_socket = true;
        openNewConnection(language, session_id);
    };

    const hasReadyState = (...states) => binary_socket && states.some(s => binary_socket.readyState === s);

    const init = ({ options, client }) => {
        if (typeof options === 'object' && config !== options) {
            config = options;
        }
        client_store = client;
    };

    const getMockServerConfig = () => {
        const mock_server_config = localStorage.getItem('mock_server_data');
        return mock_server_config
            ? JSON.parse(mock_server_config)
            : {
                  session_id: '',
                  is_mockserver_enabled: false,
              };
    };

    const openNewConnection = (language = getLanguage()) => {
        const mock_server_config = getMockServerConfig();
        const session_id = mock_server_config?.session_id || '';

        if (wrong_app_id === getAppId()) return;

        if (!is_switching_socket) config.wsEvent('init');

        if (isClose()) {
            is_disconnect_called = false;
            const socket_url = getSocketUrl(language, session_id);
            // Use the V2WrappedWebSocket only when connected to the v2 OTP endpoint.
            // On the initial load the OTP URL is not yet available, so the first
            // connection uses the legacy URL (plain WebSocket).  V2RootGate calls
            // closeAndOpenNewConnection() after bridge auth, which re-enters here
            // with the real OTP URL and activates the wrapper.
            const use_v2_wrapper = isV2Api() && /\/trading\/v\d+\//.test(socket_url);

            if (use_v2_wrapper) {
                binary_socket = new V2WrappedWebSocket(socket_url, buildV2AuthorizeStub());
            } else {
                binary_socket = new WebSocket(socket_url);
            }

            deriv_api = new DerivAPIBasic({
                connection: binary_socket,
                storage: SocketCache,
                middleware: new APIMiddleware(config, session_id),
            });
        }

        deriv_api.onOpen().subscribe(() => {
            config.wsEvent('open');

            wait('website_status');

            if (binary_socket instanceof V2WrappedWebSocket) {
                // OTP URL is pre-authenticated.  Calling authorize() here lets the
                // wrapper dispatch a synthetic response so DerivAPIBasic resolvers
                // (expectResponse('authorize'), WS.authorized.X()) unlock normally.
                deriv_api.authorize('v2-otp-pre-authenticated');
            } else if (client_store.is_logged_in) {
                const authorize_token = client_store.getToken();
                deriv_api.authorize(authorize_token);
            }

            if (typeof config.onOpen === 'function') {
                config.onOpen(isReady());
            }

            if (isV2Api() && sessionStorage.getItem('v2_ws_url') && !(binary_socket instanceof V2WrappedWebSocket)) {
                // Fallback: v2 mode but wrapper not active yet (first load before OTP arrives).
                // Emit a synthetic authorize so the app does not get stuck.
                emitSyntheticResponse(applyV2AuthToClientStore(client_store) || buildV2AuthorizeResponse());
            }

            if (typeof config.onReconnect === 'function' && is_connected_before) {
                config.onReconnect();
            }

            if (!is_connected_before) {
                is_connected_before = true;
            }
        });

        deriv_api.onMessage().subscribe(({ data }) => {
            // V2WrappedWebSocket already normalises responses before emitting the
            // MessageEvent, so we only apply the adapter's normalisation on the
            // legacy path (plain WebSocket in v2 fallback mode).
            const response = (isV2Api() && !(binary_socket instanceof V2WrappedWebSocket))
                ? normalizeV2Response(data)
                : data;
            const msg_type = response.msg_type;
            State.set(['response', msg_type], cloneObject(response));

            config.wsEvent('message');

            if (getPropertyValue(response, ['error', 'code']) === 'InvalidAppID') {
                wrong_app_id = getAppId();
            }

            if (typeof config.onMessage === 'function') {
                config.onMessage(response);
            }
        });

        deriv_api.onClose().subscribe(() => {
            if (!is_switching_socket) {
                config.wsEvent('close');
            } else {
                is_switching_socket = false;
            }

            if (wrong_app_id !== getAppId() && typeof config.onDisconnect === 'function' && !is_disconnect_called) {
                config.onDisconnect();
                is_disconnect_called = true;
            }
        });
    };

    const isSiteUp = status => /^up$/i.test(status);

    const isSiteUpdating = status => /^updating$/i.test(status);

    const isSiteDown = status => /^down$/i.test(status);

    // if status is up or updating, consider site available
    // if status is down, consider site unavailable
    const setAvailability = status => {
        availability.is_up = isSiteUp(status);
        availability.is_updating = isSiteUpdating(status);
        availability.is_down = isSiteDown(status);
    };

    const excludeAuthorize = type => !(type === 'authorize' && !client_store.is_logged_in);

    const wait = (...responses) => deriv_api?.expectResponse(...responses.filter(excludeAuthorize));

    const subscribe = (request, cb) => deriv_api.subscribe(request).subscribe(cb, cb); // Delegate error handling to the callback

    const balanceAll = () => deriv_api.send({ balance: 1, account: 'all' });

    const subscribeBalanceAll = cb => subscribe({ balance: 1, account: 'all' }, cb);

    const subscribeBalanceActiveAccount = (cb, account) => subscribe({ balance: 1, account }, cb);

    const subscribeProposal = (req, cb) => subscribe({ proposal: 1, ...req }, cb);

    const subscribeProposalOpenContract = (contract_id = null, cb) =>
        subscribe({ proposal_open_contract: 1, ...(contract_id && { contract_id }) }, cb);

    const subscribeTicks = (symbol, cb) => subscribe({ ticks: symbol }, cb);

    const subscribeTicksHistory = (request_object, cb) => subscribe(request_object, cb);

    const subscribeTransaction = cb => subscribe({ transaction: 1 }, cb);

    const subscribeWebsiteStatus = cb => subscribe({ website_status: 1 }, cb);

    const getTicksHistory = request_object => deriv_api.send(request_object);

    // ── Parent-bridge buy helper ──────────────────────────────────────────────
    // When DTrader runs inside the parent iframe, trade execution is delegated
    // to the parent (which holds the PKCE-authenticated WS session).  The parent
    // listens for BUY_REQUEST, calls sendViaNewSystemWithPromise, and posts back
    // BUY_RESULT.  A unique reqId ties each request to its response.
    const BUY_BRIDGE_TIMEOUT_MS = 30000;

    const _buyViaParent = (reqId, postPayload) =>
        new Promise((resolve, reject) => {
            let settled = false;
            let timeoutHandle;

            const cleanup = () => {
                window.removeEventListener('message', onResult);
                clearTimeout(timeoutHandle);
            };

            const onResult = event => {
                // Only accept messages from the direct parent window
                if (event.source !== window.parent) return;
                if (!event.data || event.data.type !== 'BUY_RESULT' || event.data.reqId !== reqId) return;
                if (settled) return;
                settled = true;
                cleanup();
                const { payload } = event.data;
                if (payload && payload.error) reject(payload);
                else resolve(payload);
            };

            timeoutHandle = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                reject({ error: { code: 'BuyBridgeTimeout', message: 'Parent did not respond to BUY_REQUEST within 30 s.' } });
            }, BUY_BRIDGE_TIMEOUT_MS);

            window.addEventListener('message', onResult);
            window.parent.postMessage({ type: 'BUY_REQUEST', reqId, payload: postPayload }, '*');
        });

    const _inIframe = () => {
        try { return window.self !== window.top; } catch (_) { return true; }
    };

    const buyAndSubscribe = request => {
        if (_inIframe()) {
            const reqId = 'buy_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            return _buyViaParent(reqId, request);
        }
        return new Promise(resolve => {
            let called = false;
            const subscriber = subscribe(request, response => {
                if (!called) {
                    called = true;
                    subscriber.unsubscribe();
                    resolve(response);
                }
            });
        });
    };

    const buy = ({ proposal_id, price }) => {
        if (_inIframe()) {
            const reqId = 'buy_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            return _buyViaParent(reqId, { buy: proposal_id, price });
        }
        return deriv_api.send({ buy: proposal_id, price });
    };

    const sell = (contract_id, bid_price) => deriv_api.send({ sell: contract_id, price: bid_price });

    const cashier = (action, parameters = {}) => deriv_api.send({ cashier: action, ...parameters });

    const cancelCryptoTransaction = transaction_id =>
        deriv_api.send({ cashier_withdrawal_cancel: 1, id: transaction_id });

    const newAccountVirtual = (verification_code, client_password, residence, device_data) =>
        deriv_api.send({
            new_account_virtual: 1,
            verification_code,
            client_password,
            residence,
            ...device_data,
        });

    const setAccountCurrency = (currency, passthrough) =>
        deriv_api.send({
            set_account_currency: currency,
            ...(passthrough && { passthrough }),
        });

    const newAccountReal = values =>
        deriv_api.send({
            new_account_real: 1,
            ...values,
        });

    const newAccountRealMaltaInvest = values => deriv_api.send({ new_account_maltainvest: 1, ...values });

    const mt5NewAccount = values =>
        deriv_api.send({
            mt5_new_account: 1,
            ...values,
        });

    const getFinancialAssessment = () =>
        deriv_api.send({
            get_financial_assessment: 1,
        });

    const setFinancialAndTradingAssessment = payload => deriv_api.send({ set_financial_assessment: 1, ...payload });

    const profitTable = (limit, offset, date_boundaries) =>
        deriv_api.send({ profit_table: 1, description: 1, limit, offset, ...date_boundaries });

    const statement = (limit, offset, other_properties) =>
        deriv_api.send({ statement: 1, description: 1, limit, offset, ...other_properties });

    const verifyEmail = (email, type, payload = {}) => deriv_api.send({ verify_email: email, type, ...payload });

    const tradingPlatformPasswordChange = payload =>
        deriv_api.send({
            trading_platform_password_change: 1,
            ...payload,
        });

    const tradingPlatformInvestorPasswordChange = payload =>
        deriv_api.send({
            trading_platform_investor_password_change: 1,
            ...payload,
        });

    const tradingPlatformInvestorPasswordReset = payload =>
        deriv_api.send({
            trading_platform_investor_password_reset: 1,
            ...payload,
        });

    const tradingPlatformPasswordReset = payload =>
        deriv_api.send({
            trading_platform_password_reset: 1,
            ...payload,
        });

    const tradingPlatformAvailableAccounts = platform =>
        deriv_api.send({
            trading_platform_available_accounts: 1,
            platform,
        });

    const paymentAgentList = (country, currency) =>
        deriv_api.send({ paymentagent_list: country, ...(currency && { currency }) });

    const allPaymentAgentList = country => deriv_api.send({ paymentagent_list: country });

    const paymentAgentDetails = (passthrough, req_id) =>
        deriv_api.send({ paymentagent_details: 1, passthrough, req_id });

    const paymentAgentWithdraw = ({ amount, currency, dry_run = 0, loginid, verification_code }) =>
        deriv_api.send({
            amount,
            currency,
            dry_run,
            paymentagent_loginid: loginid,
            paymentagent_withdraw: 1,
            verification_code,
        });

    const cryptoWithdraw = ({ address, amount, verification_code, estimated_fee_unique_id, dry_run = 0 }) =>
        deriv_api.send({
            cashier: 'withdraw',
            provider: 'crypto',
            type: 'api',
            address,
            amount,
            verification_code,
            estimated_fee_unique_id,
            dry_run,
        });

    const cryptoConfig = () =>
        deriv_api.send({
            crypto_config: 1,
        });

    const paymentAgentTransfer = ({ amount, currency, description, transfer_to, dry_run = 0 }) =>
        deriv_api.send({
            amount,
            currency,
            description,
            transfer_to,
            paymentagent_transfer: 1,
            dry_run,
        });

    const activeSymbols = (mode = 'brief') => deriv_api.activeSymbols(mode);

    const contractsForCompany = ({ landing_company }) =>
        deriv_api.send({
            landing_company,
            contracts_for_company: 1,
        });

    const transferBetweenAccounts = (account_from, account_to, currency, amount) =>
        deriv_api.send({
            transfer_between_accounts: 1,
            accounts: 'all',
            ...(account_from && {
                account_from,
                account_to,
                currency,
                amount,
            }),
        });

    const forgetStream = id => deriv_api.forget(id);

    const tncApproval = () => deriv_api.send({ tnc_approval: '1' });

    const contractUpdate = (contract_id, limit_order) =>
        deriv_api.send({
            contract_update: 1,
            contract_id,
            limit_order,
        });

    const contractUpdateHistory = contract_id =>
        deriv_api.send({
            contract_update_history: 1,
            contract_id,
        });

    const cancelContract = contract_id => deriv_api.send({ cancel: contract_id });

    const fetchLoginHistory = limit =>
        deriv_api.send({
            login_history: 1,
            limit,
        });

    // subscribe method export for P2P use only
    // so that subscribe remains private
    const p2pSubscribe = (request, cb) => subscribe(request, cb);
    const accountStatistics = () => deriv_api.send({ account_statistics: 1 });

    const tradingServers = platform => deriv_api.send({ platform, trading_servers: 1 });

    const tradingPlatformAccountsList = platform =>
        deriv_api.send({
            trading_platform_accounts: 1,
            platform,
        });

    const tradingPlatformNewAccount = values =>
        deriv_api.send({
            trading_platform_new_account: 1,
            ...values,
        });

    const triggerMt5DryRun = ({ email }) =>
        deriv_api.send({
            account_type: 'financial',
            dry_run: 1,
            email,
            leverage: 100,
            mainPassword: 'Test1234',
            mt5_account_type: 'financial_stp',
            mt5_new_account: 1,
            name: 'test real labuan financial stp',
        });

    const getPhoneSettings = () => deriv_api.send({ phone_settings: 1 });

    const getServiceToken = (platform, server) => {
        const temp_service = platform;

        return deriv_api.send({
            service_token: 1,
            service: temp_service,
            server,
        });
    };

    const changeEmail = api_request => deriv_api.send(api_request);

    const getWalletMigrationState = () =>
        deriv_api.send({
            wallet_migration: 'state',
        });

    const startWalletMigration = () =>
        deriv_api.send({
            wallet_migration: 'start',
        });

    const resetWalletMigration = () =>
        deriv_api.send({
            wallet_migration: 'reset',
        });

    return {
        init,
        openNewConnection,
        forgetStream,
        wait,
        availability,
        hasReadyState,
        isSiteDown,
        isSiteUpdating,
        clear: () => {
            // do nothing.
        },
        sendBuffered: () => {
            // do nothing.
        },
        getSocket: () => binary_socket,
        get: () => deriv_api,
        getAvailability: () => availability,
        setOnDisconnect: onDisconnect => {
            config.onDisconnect = onDisconnect;
        },
        setOnReconnect: onReconnect => {
            config.onReconnect = onReconnect;
        },
        removeOnReconnect: () => {
            delete config.onReconnect;
        },
        removeOnDisconnect: () => {
            delete config.onDisconnect;
        },
        cache: delegateToObject({}, () => deriv_api.cache),
        storage: delegateToObject({}, () => deriv_api.storage),
        blockRequest,
        buy,
        buyAndSubscribe,
        sell,
        cashier,
        cancelCryptoTransaction,
        cancelContract,
        close,
        cryptoWithdraw,
        cryptoConfig,
        contractUpdate,
        contractUpdateHistory,
        getFinancialAssessment,
        setFinancialAndTradingAssessment,
        mt5NewAccount,
        newAccountVirtual,
        newAccountReal,
        newAccountRealMaltaInvest,
        getPhoneSettings,
        p2pSubscribe,
        profitTable,
        statement,
        verifyEmail,
        getTicksHistory,
        tradingPlatformPasswordChange,
        tradingPlatformPasswordReset,
        tradingPlatformAvailableAccounts,
        tradingPlatformInvestorPasswordChange,
        tradingPlatformInvestorPasswordReset,
        activeSymbols,
        contractsForCompany,
        paymentAgentList,
        allPaymentAgentList,
        paymentAgentDetails,
        paymentAgentWithdraw,
        paymentAgentTransfer,
        setAccountCurrency,
        balanceAll,
        setAvailability,
        subscribeBalanceAll,
        subscribeBalanceActiveAccount,
        subscribeProposal,
        subscribeProposalOpenContract,
        subscribeTicks,
        subscribeTicksHistory,
        subscribeTransaction,
        subscribeWebsiteStatus,
        tncApproval,
        transferBetweenAccounts,
        fetchLoginHistory,
        closeAndOpenNewConnection,
        accountStatistics,
        tradingServers,
        tradingPlatformAccountsList,
        tradingPlatformNewAccount,
        triggerMt5DryRun,
        getServiceToken,
        changeEmail,
        getWalletMigrationState,
        startWalletMigration,
        resetWalletMigration,
    };
})();

function delegateToObject(base_obj, extending_obj_getter) {
    return new Proxy(base_obj, {
        get(target, field) {
            if (target[field]) return target[field];

            const extending_obj =
                typeof extending_obj_getter === 'function' ? extending_obj_getter() : extending_obj_getter;

            if (!extending_obj) return undefined;

            const value = extending_obj[field];
            if (value) {
                if (typeof value === 'function') {
                    return value.bind(extending_obj);
                }
                return value;
            }

            return undefined;
        },
    });
}

const proxied_socket_base = delegateToObject(BinarySocketBase, () => BinarySocketBase.get());

const proxyForAuthorize = obj =>
    new Proxy(obj, {
        get(target, field) {
            if (target[field] && typeof target[field] !== 'function') {
                return proxyForAuthorize(target[field]);
            }
            return (...args) => BinarySocketBase?.wait('authorize')?.then(() => target[field](...args));
        },
    });

BinarySocketBase.authorized = proxyForAuthorize(proxied_socket_base);

module.exports = proxied_socket_base;
