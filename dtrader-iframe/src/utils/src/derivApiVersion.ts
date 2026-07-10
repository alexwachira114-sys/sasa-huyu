const API_VERSION_STORAGE_KEY = 'deriv_api_version';

type TApiVersion = 'v1' | 'v2' | string;

const safeStorageGet = (storage: Storage | undefined, key: string) => {
    try {
        return storage?.getItem(key) ?? null;
    } catch {
        return null;
    }
};

const safeStorageSet = (storage: Storage | undefined, key: string, value: string) => {
    try {
        storage?.setItem(key, value);
    } catch {
        // ignore storage failures in embedded/private contexts
    }
};

export const getDerivApiVersion = (): TApiVersion => {
    if (typeof window === 'undefined') return 'v1';

    const url_version = new URLSearchParams(window.location.search).get('api_version');
    return (
        url_version ||
        safeStorageGet(window.sessionStorage, API_VERSION_STORAGE_KEY) ||
        safeStorageGet(window.localStorage, API_VERSION_STORAGE_KEY) ||
        'v1'
    );
};

export const isV2Api = () => getDerivApiVersion() === 'v2';

export const setDerivApiVersion = (version: TApiVersion) => {
    if (typeof window === 'undefined') return;

    safeStorageSet(window.sessionStorage, API_VERSION_STORAGE_KEY, version);
    safeStorageSet(window.localStorage, API_VERSION_STORAGE_KEY, version);
};

export const clearDerivApiVersion = () => {
    if (typeof window === 'undefined') return;

    try {
        window.sessionStorage.removeItem(API_VERSION_STORAGE_KEY);
        window.localStorage.removeItem(API_VERSION_STORAGE_KEY);
    } catch {
        // ignore storage failures in embedded/private contexts
    }
};
