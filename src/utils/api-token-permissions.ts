import { isDemoAccount } from './account-helpers';

export const API_TOKEN_AUTH_METHOD_KEY = 'auth_method';
export const API_TOKEN_AUTH_METHOD = 'api_token';
export const API_TOKEN_SCOPES_KEY = 'api_token_scopes';
export const API_TOKEN_PENDING_KEY = 'pending_api_token';
export const API_TOKEN_ACCOUNT_DETAILS_KEY = 'api_token_account_details';
export const API_TOKEN_LOGIN_ERROR_KEY = 'api_token_login_error';

export type ApiTokenScope = 'read' | 'trade' | 'payments' | 'admin' | 'trading_information' | string;

export type ApiTokenAccountDetails = {
    account_id: string;
    balance: number;
    currency: string;
    account_type: 'demo' | 'real';
    status: string;
};

export const normalizeScopes = (scopes: unknown): ApiTokenScope[] => {
    if (Array.isArray(scopes)) return scopes.map(scope => String(scope).trim()).filter(Boolean);
    if (typeof scopes === 'string')
        return scopes.split(/\s+/).map(scope => scope.trim()).filter(Boolean);
    return [];
};

export const isApiTokenSession = () => localStorage.getItem(API_TOKEN_AUTH_METHOD_KEY) === API_TOKEN_AUTH_METHOD;

export const getApiTokenScopes = (): ApiTokenScope[] => {
    try {
        return normalizeScopes(JSON.parse(localStorage.getItem(API_TOKEN_SCOPES_KEY) || '[]'));
    } catch {
        return [];
    }
};

export const hasApiTokenScope = (scope: ApiTokenScope) => {
    if (!isApiTokenSession()) return true;
    return getApiTokenScopes().includes(scope);
};

export const assertApiTokenScope = (scope: ApiTokenScope) => {
    if (!hasApiTokenScope(scope)) {
        throw new Error(`The provided API token does not include the required "${scope}" scope.`);
    }
};
