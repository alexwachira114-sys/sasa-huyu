const STRIP_KEYS = new Set(['loginid']);

export function transformV2Request(request: Record<string, unknown>): Record<string, unknown> | null {
    if (!request || typeof request !== 'object') return request;

    if ('authorize' in request && typeof request.authorize === 'string') {
        return null;
    }

    const output: Record<string, unknown> = {};

    Object.entries(request).forEach(([key, value]) => {
        if (STRIP_KEYS.has(key)) return;
        if (key === 'symbol') {
            output.underlying_symbol = value;
            return;
        }
        if ((key === 'account' || key === 'accounts') && 'balance' in request) return;

        output[key] = value;
    });

    return output;
}

export { normalizeV2Response } from './deriv-v2-normalize';
