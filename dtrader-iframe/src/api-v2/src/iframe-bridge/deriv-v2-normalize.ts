const FIELD_RENAMES: Record<string, string> = {
    underlying_symbol: 'symbol',
    underlying_symbol_name: 'display_name',
    underlying_symbol_type: 'symbol_type',
    exit_spot: 'sell_spot',
    pip_size: 'pip',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const getActiveLoginid = () => {
    if (typeof sessionStorage === 'undefined') return '';
    return sessionStorage.getItem('v2_active_account_id') || localStorage.getItem('active_loginid') || '';
};

const normalizeBalance = <T>(response: T): T => {
    if (!isPlainObject(response) || response.msg_type !== 'balance' || !isPlainObject(response.balance))
        return response;
    if (isPlainObject(response.balance.accounts)) return response;

    const loginid = String(response.balance.loginid || getActiveLoginid());
    if (!loginid) return response;

    return {
        ...response,
        balance: {
            ...response.balance,
            loginid,
            accounts: {
                [loginid]: {
                    balance: response.balance.balance,
                    converted_amount: response.balance.balance,
                    currency: response.balance.currency,
                    demo_account: /^VRT|^VRW/.test(loginid) ? 1 : 0,
                    status: 1,
                    type: 'deriv',
                },
            },
        },
    };
};

export function normalizeV2Response<T = unknown>(input: T): T {
    if (Array.isArray(input)) {
        return input.map(item => normalizeV2Response(item)) as unknown as T;
    }

    if (!isPlainObject(input)) return input;

    const output: Record<string, unknown> = {};
    Object.entries(input).forEach(([key, value]) => {
        output[FIELD_RENAMES[key] ?? key] = normalizeV2Response(value);
    });

    return normalizeBalance(output as T);
}
