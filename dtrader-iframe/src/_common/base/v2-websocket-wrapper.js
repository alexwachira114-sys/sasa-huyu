/**
 * v2-websocket-wrapper.js
 *
 * Wraps a native WebSocket so that:
 *  - Outgoing `authorize` requests are suppressed (OTP URL is pre-authenticated);
 *    a synthetic authorize response is dispatched instead so DerivAPIBasic
 *    resolvers (`expectResponse('authorize')`, `WS.authorized.X()`) still resolve.
 *  - Outgoing messages get v2 protocol transformation (symbol -> underlying_symbol).
 *  - Requests for v1-only endpoints that the v2 trading endpoint does not support
 *    (website_status, payout_currencies, get_settings, etc.) are intercepted and
 *    answered with locally-synthesised stubs.
 *  - Incoming messages are normalised back to the v1 field-name shape that legacy
 *    callers expect (underlying_symbol -> symbol, with FIELD_ALIASES so both names
 *    are present).  Contract-shaped payloads get display_value aliases synthesised.
 */

/* eslint-disable no-console */
const isDebug = () => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('bridge_debug') === '1';
    } catch (_e) {
        return false;
    }
};
const debug = (...args) => {
    if (isDebug()) console.log('[V2WS]', ...args);
};

// Request transform

const STRIP_REQUEST_KEYS = new Set(['loginid']);
const ENDPOINT_STRIP_REQUEST_KEYS = {
    active_symbols: new Set(['barrier_category', 'landing_company', 'landing_company_short', 'product_type']),
    contracts_for: new Set(['currency', 'landing_company', 'landing_company_short', 'product_type']),
    proposal: new Set(['barrier_range', 'date_start', 'product_type', 'trade_risk_profile', 'trading_period_start']),
};

const getRequestType = request =>
    Object.keys(request).find(key => !['passthrough', 'req_id', 'subscribe'].includes(key));

function transformV2Request(req) {
    if (!req || typeof req !== 'object') return req;

    // Suppress authorize - OTP URL is already authenticated
    if ('authorize' in req && typeof req.authorize === 'string') return null;

    const request_type = getRequestType(req);
    const endpoint_strip_keys = ENDPOINT_STRIP_REQUEST_KEYS[request_type] || new Set();
    const isBalance = 'balance' in req;
    const out = {};

    Object.entries(req).forEach(([key, value]) => {
        if (STRIP_REQUEST_KEYS.has(key)) return;
        if (endpoint_strip_keys.has(key)) return;
        // NOTE: `symbol` is intentionally NOT renamed to `underlying_symbol`.
        // The OTP URL used by this bridge points at the standard Deriv
        // WebSocket endpoint, which only accepts `symbol` on `proposal` and
        // `buy.parameters` — sending `underlying_symbol` gets the whole
        // request rejected with "Input validation failed: Properties not
        // allowed: underlying_symbol". Fixed 2026-07-10.
        // v2 balance endpoint doesn't accept account/accounts params
        if (isBalance && (key === 'account' || (key === 'accounts' && value === 'all'))) return;
        out[key] = value;
    });
    return out;
}

// Response normalise

// Keep BOTH the v2 name and the v1 alias in the response so legacy code paths
// that look for the original name still work.
const FIELD_ALIASES = {
    underlying_symbol: ['symbol'],
    underlying_symbol_name: ['display_name'],
    underlying_symbol_type: ['symbol_type'],
    exit_spot: ['sell_spot'],
    exit_spot_time: ['sell_spot_time', 'exit_tick_time'],
    pip_size: ['pip'],
};

const safeJSONParse = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (_e) {
        return fallback;
    }
};

const getActiveV2Loginid = () => {
    try {
        return sessionStorage.getItem('v2_active_account_id') || localStorage.getItem('active_loginid');
    } catch (_e) {
        return '';
    }
};

function normalizeV2Response(input) {
    if (Array.isArray(input)) return input.map(normalizeV2Response);
    if (input === null || typeof input !== 'object') return input;

    const out = {};
    Object.entries(input).forEach(([key, value]) => {
        const normalized = normalizeV2Response(value);
        out[key] = normalized;
        const aliases = FIELD_ALIASES[key];
        if (aliases) {
            aliases.forEach(alias => {
                if (out[alias] === undefined) out[alias] = normalized;
            });
        }
    });

    // Synthesise display-value aliases for contract-shaped payloads so that the
    // digit chart, accumulator UI, and contract-trade-store all tick correctly.
    if ('entry_spot' in out || 'current_spot' in out || 'exit_spot' in out) {
        if (out.entry_spot !== undefined && out.entry_tick === undefined) out.entry_tick = out.entry_spot;
        if (out.entry_spot !== undefined && out.entry_tick_display_value === undefined)
            out.entry_tick_display_value = String(out.entry_spot);
        if (out.entry_spot !== undefined && out.entry_spot_display_value === undefined)
            out.entry_spot_display_value = String(out.entry_spot);
        if (out.entry_spot_time !== undefined && out.entry_tick_time === undefined)
            out.entry_tick_time = out.entry_spot_time;
        if (out.current_spot !== undefined && out.current_spot_display_value === undefined)
            out.current_spot_display_value = String(out.current_spot);
        if (out.bid_price !== undefined && out.display_value === undefined) out.display_value = String(out.bid_price);
        if (out.exit_spot !== undefined && out.exit_tick === undefined) out.exit_tick = out.exit_spot;
        if (out.exit_spot !== undefined && out.exit_tick_display_value === undefined)
            out.exit_tick_display_value = String(out.exit_spot);
        if (out.exit_spot !== undefined && out.sell_spot_display_value === undefined)
            out.sell_spot_display_value = String(out.exit_spot);
        // Oldest code paths look for `underlying` not `symbol`
        if (out.symbol !== undefined && out.underlying === undefined) out.underlying = out.symbol;
    }

    // SmartCharts and legacy market selectors still sort/group by the v1 display
    // fields. V2 may omit some of them, so keep deterministic string fallbacks.
    if ('underlying_symbol' in out || 'symbol' in out) {
        const symbol = out.symbol || out.underlying_symbol;
        if (out.symbol === undefined) out.symbol = symbol;
        if (out.underlying_symbol === undefined) out.underlying_symbol = symbol;
        if (out.display_name === undefined) out.display_name = out.underlying_symbol_name || symbol;
        if (out.underlying_symbol_name === undefined) out.underlying_symbol_name = out.display_name;
        if (out.symbol_type === undefined)
            out.symbol_type = out.underlying_symbol_type || out.submarket || out.market || '';
        if (out.underlying_symbol_type === undefined) out.underlying_symbol_type = out.symbol_type;
        if (out.market_display_name === undefined) out.market_display_name = out.market || '';
        if (out.submarket_display_name === undefined) out.submarket_display_name = out.submarket || '';
        if (out.subgroup_display_name === undefined) out.subgroup_display_name = out.subgroup || out.submarket || '';
    }

    if (out.msg_type === 'proposal' && out.proposal) {
        const proposal = out.proposal;
        if (proposal.display_value === undefined && proposal.ask_price !== undefined) {
            proposal.display_value = String(proposal.ask_price);
        }
    }

    if (out.msg_type === 'balance' && out.balance && !out.balance.accounts) {
        const loginid = out.balance.loginid || getActiveV2Loginid();
        if (loginid) {
            out.balance.loginid = loginid;
            out.balance.accounts = {
                [loginid]: {
                    balance: out.balance.balance,
                    converted_amount: out.balance.balance,
                    currency: out.balance.currency,
                    demo_account: /^VRT|^VRW/.test(loginid) ? 1 : 0,
                    status: 1,
                    type: 'deriv',
                },
            };
        }
    }

    // V2 contracts_for rows can omit or rename fields that the legacy Trader
    // contract config builder assumes are always present.
    if ('contract_type' in out && ('min_contract_duration' in out || 'max_contract_duration' in out)) {
        if (!out.start_type || out.start_type === 'now') {
            out.start_type = 'spot';
        }
        if (out.start_type !== 'spot' && out.start_type !== 'forward') {
            out.start_type = 'spot';
        }
        if (!out.expiry_type) {
            const duration = String(out.min_contract_duration || out.max_contract_duration || '');
            const unit = duration.match(/[a-zA-Z]+$/)?.[0];
            if (unit === 't') out.expiry_type = 'tick';
            else if (unit === 'd') out.expiry_type = 'daily';
            else out.expiry_type = 'intraday';
        }
        if (out.expiry_type === 'ticks') out.expiry_type = 'tick';
    }

    return out;
}

// v1-only stubs

// The v2 trading endpoint does not support these methods.  We intercept them
// client-side and return minimally-valid synthetic responses so that callers
// waiting on `WS.wait(name)` / `expectResponse(name)` always resolve.
const V1_ONLY_STUBS = {
    website_status: () => ({
        site_status: 'up',
        message: '',
        api_call_limits: {
            max_proposal_subscription: { applies_to: 'subscribing to proposal', max: 5 },
            max_requestes_general: { applies_to: 'general requests', hourly: 14400, minutely: 60 },
            max_requests_outcome: { applies_to: 'requests requiring authentication', hourly: 14400, minutely: 60 },
            max_requests_pricing: { applies_to: 'requests using pricing parameters', hourly: 1500, minutely: 60 },
        },
        currencies_config: {},
        terms_conditions_version: '1.0.0',
        clients_country: 'us',
    }),
    payout_currencies: () => {
        try {
            const accounts = safeJSONParse(sessionStorage.getItem('v2_accounts'), []);
            const currencies = Array.from(new Set(accounts.map(a => a.currency).filter(Boolean)));
            return currencies.length ? currencies : ['USD'];
        } catch (_e) {
            return ['USD'];
        }
    },
    get_settings: () => {
        try {
            const profile = safeJSONParse(sessionStorage.getItem('v2_user_profile'), {});
            return {
                email: profile.email || '',
                country: profile.country || profile.residence || '',
                country_code: profile.country_code || '',
                first_name: profile.first_name || '',
                last_name: profile.last_name || '',
                residence: profile.residence || profile.country || '',
                user_hash: '',
            };
        } catch (_e) {
            return {};
        }
    },
    get_account_status: () => ({
        status: [],
        risk_classification: 'low',
        prompt_client_to_authenticate: 0,
        currency_config: {},
    }),
    landing_company: () => ({}),
    mt5_login_list: () => [],
    trading_servers: () => [],
    cashier_payments: () => ({ crypto: [] }),
    // sell_expired cleans up expired contracts; v2 expires them server-side
    sell_expired: () => ({ count: 0 }),
};

const buildStubResponse = (requestType, parsed) => {
    const stub = V1_ONLY_STUBS[requestType];
    if (!stub) return null;
    return {
        msg_type: requestType,
        echo_req: parsed,
        req_id: parsed.req_id,
        [requestType]: stub(parsed),
    };
};

// V2WrappedWebSocket

/**
 * A WebSocket-compatible wrapper that sits between DerivAPIBasic and the real
 * v2 OTP WebSocket.  It transparently applies request transforms, response
 * normalisation, authorize suppression, and v1-only stubs.
 *
 * @param {string} url - The v2 OTP-pre-authenticated WebSocket URL.
 * @param {object} authorizeStub - The `authorize` payload to return when an
 *   `authorize` request is intercepted (just the `authorize` object, not the
 *   full response wrapper).
 */
class V2WrappedWebSocket extends EventTarget {
    constructor(url, authorizeStub = {}) {
        super();
        this._authorizeStub = authorizeStub;
        this._real = new WebSocket(url);
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;

        this._real.addEventListener('open', () => {
            const event = new Event('open');
            this.dispatchEvent(event);
            if (typeof this.onopen === 'function') this.onopen(event);
        });

        this._real.addEventListener('message', event => {
            let normalizedData = event.data;
            try {
                const parsed = JSON.parse(event.data);
                const normalized = normalizeV2Response(parsed);
                normalizedData = JSON.stringify(normalized);
                debug('response in:', normalized.msg_type || '(no msg_type)');
            } catch (_e) {
                console.warn('[V2WS] non-JSON message:', event.data);
            }
            const newEvent = new MessageEvent('message', { data: normalizedData, origin: event.origin });
            this.dispatchEvent(newEvent);
            if (typeof this.onmessage === 'function') this.onmessage(newEvent);
        });

        this._real.addEventListener('close', e => {
            const event = new CloseEvent('close', { code: e.code, reason: e.reason, wasClean: e.wasClean });
            this.dispatchEvent(event);
            if (typeof this.onclose === 'function') this.onclose(event);
        });

        this._real.addEventListener('error', () => {
            const event = new Event('error');
            this.dispatchEvent(event);
            if (typeof this.onerror === 'function') this.onerror(event);
        });
    }

    get readyState() { return this._real.readyState; }
    get url() { return this._real.url; }
    get protocol() { return this._real.protocol; }
    get bufferedAmount() { return this._real.bufferedAmount; }
    get extensions() { return this._real.extensions; }
    get binaryType() { return this._real.binaryType; }
    set binaryType(v) { this._real.binaryType = v; }

    get CONNECTING() { return WebSocket.CONNECTING; }
    get OPEN() { return WebSocket.OPEN; }
    get CLOSING() { return WebSocket.CLOSING; }
    get CLOSED() { return WebSocket.CLOSED; }

    send(data) {
        if (typeof data !== 'string') return this._real.send(data);

        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch (_e) {
            return this._real.send(data);
        }

        const transformed = transformV2Request(parsed);

        // authorize suppressed - dispatch synthetic response so DerivAPIBasic resolvers unlock
        if (transformed === null) {
            if (parsed.authorize !== undefined) {
                debug('suppressing authorize, dispatching stub');
                this._dispatchSynthetic({
                    msg_type: 'authorize',
                    echo_req: parsed,
                    req_id: parsed.req_id,
                    authorize: this._authorizeStub,
                });
            }
            return;
        }

        // Intercept v1-only requests and reply locally
        const requestType = getRequestType(parsed);
        const stub = buildStubResponse(requestType, parsed);
        if (stub) {
            debug('stubbing v1-only request:', requestType);
            this._dispatchSynthetic(stub);
            return;
        }

        return this._real.send(JSON.stringify(transformed));
    }

    _dispatchSynthetic(payload) {
        setTimeout(() => {
            const event = new MessageEvent('message', { data: JSON.stringify(payload) });
            this.dispatchEvent(event);
            if (typeof this.onmessage === 'function') this.onmessage(event);
        }, 0);
    }

    close(code, reason) { return this._real.close(code, reason); }
}

module.exports = { V2WrappedWebSocket };
