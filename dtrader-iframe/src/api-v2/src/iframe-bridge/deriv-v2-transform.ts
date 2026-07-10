const STRIP_KEYS = new Set(['loginid']);

export function transformV2Request(request: Record<string, unknown>): Record<string, unknown> | null {
    if (!request || typeof request !== 'object') return request;

    if ('authorize' in request && typeof request.authorize === 'string') {
        return null;
    }

    const output: Record<string, unknown> = {};

    Object.entries(request).forEach(([key, value]) => {
        if (STRIP_KEYS.has(key)) return;
        // NOTE: `symbol` is intentionally NOT renamed to `underlying_symbol`.
        // The real Deriv WS behind otpUrl only accepts `symbol` on proposal/
        // buy.parameters — sending `underlying_symbol` gets the whole request
        // rejected with "Input validation failed: Properties not allowed:
        // underlying_symbol". Same bug/fix as v2-websocket-wrapper.js; this is
        // a separate transform pipeline that had the identical mistake. Fixed 2026-07-10.
        if ((key === 'account' || key === 'accounts') && 'balance' in request) return;

        output[key] = value;
    });

    return output;
}

export { normalizeV2Response } from './deriv-v2-normalize';
