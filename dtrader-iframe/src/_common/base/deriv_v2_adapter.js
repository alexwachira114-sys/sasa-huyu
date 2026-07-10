const FIELD_ALIASES = {
    underlying_symbol: ['symbol'],
    underlying_symbol_name: ['display_name'],
    underlying_symbol_type: ['symbol_type'],
    exit_spot: ['sell_spot'],
    exit_spot_time: ['sell_spot_time', 'exit_tick_time'],
    pip_size: ['pip'],
};

const STRIP_REQUEST_KEYS = new Set(['loginid']);
const ENDPOINT_STRIP_REQUEST_KEYS = {
    active_symbols: new Set(['barrier_category', 'landing_company', 'landing_company_short', 'product_type']),
    contracts_for: new Set(['currency', 'landing_company', 'landing_company_short', 'product_type']),
    proposal: new Set(['barrier_range', 'date_start', 'product_type', 'trade_risk_profile', 'trading_period_start']),
};
const V2_DUMMY_TOKEN = 'v2-otp-pre-authenticated';

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const safeJSONParse = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
};

const getActiveV2Loginid = () =>
    sessionStorage.getItem('v2_active_account_id') || localStorage.getItem('active_loginid');

const getV2Accounts = () => safeJSONParse(sessionStorage.getItem('v2_accounts'), []);

const getV2UserProfile = () => safeJSONParse(sessionStorage.getItem('v2_user_profile'), {});

const getV2LocalCurrencies = user_profile => user_profile.local_currencies || {};

const getRequestType = request =>
    Object.keys(request).find(key => !['passthrough', 'req_id', 'subscribe'].includes(key));

const getV2ClientAccounts = () => {
    const accounts = getV2Accounts();
    const user_profile = getV2UserProfile();

    return accounts.reduce((client_accounts, account) => {
        client_accounts[account.account_id] = {
            token: V2_DUMMY_TOKEN,
            currency: account.currency || user_profile.currency || 'USD',
            residence: user_profile.country || user_profile.residence || '',
            email: user_profile.email || '',
            is_virtual: account.account_type === 'demo' ? 1 : 0,
            landing_company_name: account.group || 'svg',
            landing_company_shortcode: account.landing_company || account.group || 'svg',
            balance: Number(account.balance || 0),
        };
        return client_accounts;
    }, {});
};

const transformV2Request = request => {
    if (!request || typeof request !== 'object') return request;

    const transformed_request = {};
    const request_type = getRequestType(request);
    const endpoint_strip_keys = ENDPOINT_STRIP_REQUEST_KEYS[request_type] || new Set();

    Object.entries(request).forEach(([key, value]) => {
        if (STRIP_REQUEST_KEYS.has(key)) return;
        if (endpoint_strip_keys.has(key)) return;

        // NOTE: `symbol` is intentionally NOT renamed to `underlying_symbol`.
        // The real Deriv WS behind otpUrl only accepts `symbol` on proposal/
        // buy.parameters — sending `underlying_symbol` gets the whole request
        // rejected with "Input validation failed: Properties not allowed:
        // underlying_symbol". This is the actual live send path (wired via
        // api_middleware.js's requestDataTransformer); v2-websocket-wrapper.js
        // is a separate, unused-in-this-path file that was fixed earlier but
        // didn't affect real traffic. Fixed 2026-07-10.
        if ((key === 'account' || key === 'accounts') && 'balance' in request) return;

        transformed_request[key] = value;
    });

    return transformed_request;
};

const normalizeV2Response = input => {
    if (Array.isArray(input)) {
        return input.map(item => normalizeV2Response(item));
    }

    if (!isPlainObject(input)) return input;

    const output = {};

    Object.entries(input).forEach(([key, value]) => {
        const normalized = normalizeV2Response(value);
        output[key] = normalized;

        const aliases = FIELD_ALIASES[key];
        if (aliases) {
            aliases.forEach(alias => {
                if (output[alias] === undefined) output[alias] = normalized;
            });
        }
    });

    return normalizeV2Proposal(
        normalizeV2ActiveSymbol(normalizeV2ContractDisplay(normalizeV2ContractMetadata(normalizeV2Balance(output))))
    );
};

const normalizeV2ActiveSymbol = output => {
    if (!('symbol' in output || 'underlying_symbol' in output)) return output;

    const symbol = output.symbol || output.underlying_symbol;
    output.symbol = symbol;
    output.underlying_symbol = output.underlying_symbol || symbol;
    output.display_name = output.display_name || output.underlying_symbol_name || symbol;
    output.underlying_symbol_name = output.underlying_symbol_name || output.display_name;
    output.symbol_type = output.symbol_type || output.underlying_symbol_type || output.submarket || output.market || '';
    output.underlying_symbol_type = output.underlying_symbol_type || output.symbol_type;
    if (output.pip !== undefined && output.pip_size === undefined) output.pip_size = output.pip;
    if (output.pip_size !== undefined && output.pip === undefined) output.pip = output.pip_size;
    output.market_display_name = output.market_display_name || output.market || '';
    output.submarket_display_name = output.submarket_display_name || output.submarket || '';
    output.subgroup_display_name = output.subgroup_display_name || output.subgroup || output.submarket || '';

    return output;
};

const normalizeV2ContractDisplay = output => {
    if (!('entry_spot' in output || 'current_spot' in output || 'sell_spot' in output || 'exit_spot' in output)) {
        return output;
    }

    if (output.entry_spot !== undefined && output.entry_tick === undefined) output.entry_tick = output.entry_spot;
    if (output.entry_spot !== undefined && output.entry_tick_display_value === undefined)
        output.entry_tick_display_value = String(output.entry_spot);
    if (output.entry_spot !== undefined && output.entry_spot_display_value === undefined)
        output.entry_spot_display_value = String(output.entry_spot);
    if (output.entry_spot_time !== undefined && output.entry_tick_time === undefined)
        output.entry_tick_time = output.entry_spot_time;
    if (output.current_spot !== undefined && output.current_spot_display_value === undefined)
        output.current_spot_display_value = String(output.current_spot);
    if (output.bid_price !== undefined && output.display_value === undefined)
        output.display_value = String(output.bid_price);
    if (output.exit_spot !== undefined && output.sell_spot === undefined) output.sell_spot = output.exit_spot;
    if (output.sell_spot !== undefined && output.exit_spot === undefined) output.exit_spot = output.sell_spot;
    if (output.sell_spot !== undefined && output.exit_tick === undefined) output.exit_tick = output.sell_spot;
    if (output.sell_spot !== undefined && output.exit_tick_display_value === undefined)
        output.exit_tick_display_value = String(output.sell_spot);
    if (output.sell_spot !== undefined && output.sell_spot_display_value === undefined)
        output.sell_spot_display_value = String(output.sell_spot);
    if (output.symbol !== undefined && output.underlying === undefined) output.underlying = output.symbol;

    return output;
};

const normalizeV2Proposal = output => {
    if (
        output?.msg_type === 'proposal' &&
        output.proposal?.display_value === undefined &&
        output.proposal.ask_price !== undefined
    ) {
        output.proposal.display_value = String(output.proposal.ask_price);
    }

    return output;
};

const normalizeV2ContractMetadata = output => {
    if (!('contract_type' in output) || !('min_contract_duration' in output || 'max_contract_duration' in output)) {
        return output;
    }

    if (!output.start_type || output.start_type === 'now') {
        output.start_type = 'spot';
    }
    if (output.start_type !== 'spot' && output.start_type !== 'forward') {
        output.start_type = 'spot';
    }
    if (!output.expiry_type) {
        const duration = String(output.min_contract_duration || output.max_contract_duration || '');
        const unit = duration.match(/[a-zA-Z]+$/)?.[0];
        if (unit === 't') output.expiry_type = 'tick';
        else if (unit === 'd') output.expiry_type = 'daily';
        else output.expiry_type = 'intraday';
    }
    if (output.expiry_type === 'ticks') {
        output.expiry_type = 'tick';
    }

    return output;
};

const normalizeV2Balance = response => {
    if (response?.msg_type !== 'balance' || !response.balance || response.balance.accounts) {
        return response;
    }

    const loginid = response.balance.loginid || getActiveV2Loginid();
    if (!loginid) return response;

    response.balance.loginid = loginid;
    response.balance.accounts = {
        [loginid]: {
            balance: response.balance.balance,
            converted_amount: response.balance.balance,
            currency: response.balance.currency,
            demo_account: /^VRT|^VRW/.test(loginid) ? 1 : 0,
            status: 1,
            type: 'deriv',
        },
    };

    return response;
};

const buildV2AuthorizeResponse = () => {
    const auth = safeJSONParse(sessionStorage.getItem('v2_auth_info'), null);
    const accounts = getV2Accounts();
    const active_loginid = getActiveV2Loginid();
    const user_profile = getV2UserProfile();
    const local_currencies = getV2LocalCurrencies(user_profile);
    const active_account = accounts.find(account => account.account_id === active_loginid) || accounts[0];

    if (!auth || !active_loginid || !active_account) return null;

    return {
        authorize: {
            account_list: accounts.map(account => ({
                account_type: 'trading',
                currency: account.currency,
                is_disabled: account.status === 'disabled' ? 1 : 0,
                is_virtual: account.account_type === 'demo' ? 1 : 0,
                landing_company_name: account.group || '',
                loginid: account.account_id,
            })),
            balance: Number(active_account.balance || 0),
            country: user_profile.country,
            currency: active_account.currency || user_profile.currency || 'USD',
            email: user_profile.email || '',
            fullname: user_profile.fullname || '',
            is_virtual: active_account.account_type === 'demo' ? 1 : 0,
            landing_company_fullname: active_account.group || '',
            landing_company_name: active_account.group || '',
            local_currencies,
            loginid: active_loginid,
            preferred_language: localStorage.getItem('i18n_language') || 'EN',
            upgradeable_landing_companies: [],
            user_id: sessionStorage.getItem('v2_client_id') || active_loginid,
        },
        country: user_profile.country,
        echo_req: {
            authorize: auth.access_token,
        },
        msg_type: 'authorize',
    };
};

const applyV2AuthToClientStore = client_store => {
    const authorize_response = buildV2AuthorizeResponse();
    if (!authorize_response || !client_store) return null;

    const accounts = getV2ClientAccounts();
    const active_loginid = authorize_response.authorize.loginid;

    client_store.setAccounts?.(accounts);
    client_store.setLoginId?.(active_loginid);
    client_store.setIsLoggingIn?.(false);
    client_store.setAccountStatus?.({
        authentication: {
            document: { status: 'none' },
            identity: { status: 'none' },
            needs_verification: [],
        },
        currency_config: {},
        prompt_client_to_authenticate: 0,
        risk_classification: 'low',
        status: [],
    });
    client_store.setAccountSettings?.({
        country: authorize_response.authorize.country || '',
        currency: authorize_response.authorize.currency || 'USD',
        email: authorize_response.authorize.email || '',
        residence: authorize_response.authorize.country || '',
    });
    client_store.setEmail?.(authorize_response.authorize.email || '');

    try {
        localStorage.setItem('client.accounts', JSON.stringify(accounts));
        sessionStorage.setItem('v2_active_account_id', active_loginid);
        sessionStorage.setItem('active_loginid', active_loginid);
        localStorage.setItem('active_loginid', active_loginid);
    } catch (_e) {
        // ignore storage failures in restricted browser contexts
    }

    return authorize_response;
};

// Returns only the `authorize` payload object (not the full response wrapper).
// Passed to V2WrappedWebSocket so it can dispatch a synthetic authorize response
// when DerivAPIBasic calls `deriv_api.authorize('v2-otp-pre-authenticated')`.
const buildV2AuthorizeStub = () => {
    const accounts = getV2Accounts();
    const active_loginid = getActiveV2Loginid();
    const user_profile = getV2UserProfile();
    const local_currencies = getV2LocalCurrencies(user_profile);
    const active_account = accounts.find(a => a.account_id === active_loginid) || accounts[0];

    if (!active_account) return {};

    return {
        loginid: active_account.account_id,
        currency: active_account.currency,
        email: user_profile.email || '',
        fullname: user_profile.fullname || '',
        country: user_profile.country || '',
        is_virtual: active_account.account_type === 'demo' ? 1 : 0,
        landing_company_name: active_account.group || 'svg',
        landing_company_shortcode: active_account.landing_company || active_account.group || 'svg',
        local_currencies,
        preferred_language: localStorage.getItem('i18n_language') || 'EN',
        upgradeable_landing_companies: [],
        user_id: sessionStorage.getItem('v2_client_id') || active_account.account_id,
        balance: Number(active_account.balance || 0),
        account_list: accounts.map(a => ({
            loginid: a.account_id,
            currency: a.currency,
            is_virtual: a.account_type === 'demo' ? 1 : 0,
            landing_company_name: a.group || 'svg',
        })),
    };
};

module.exports = {
    applyV2AuthToClientStore,
    buildV2AuthorizeResponse,
    buildV2AuthorizeStub,
    normalizeV2Response,
    transformV2Request,
};
