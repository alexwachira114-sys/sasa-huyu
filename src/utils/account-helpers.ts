export const MAX_MOBILE_WIDTH = 926;
export const ACCOUNT_TYPE_KEY = 'account_type';

/**
 * Check if a loginid represents a demo account.
 * Demo accounts have specific prefixes: VRTC, VRW, DEM, DOT.
 */
export const isDemoAccount = (loginid: string): boolean => {
    if (!loginid) return false;
    return (
        loginid.startsWith('VRTC') ||
        loginid.startsWith('VRW') ||
        loginid.startsWith('DEM') ||
        loginid.startsWith('DOT')
    );
};
