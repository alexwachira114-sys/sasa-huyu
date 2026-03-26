import LZString from 'lz-string';

export const getStoredItemsByUser = (storage_key: string, loginid?: string, default_value?: any) => {
    if (!loginid) {
        return default_value;
    }

    try {
        const storage = getStoredItemsByKey(storage_key, default_value);
        if (storage && typeof storage === 'object' && loginid in storage) {
            const value = storage[loginid];
            // Ensure we always return an array if that's what was expected
            if (Array.isArray(default_value) && !Array.isArray(value)) {
                return [];
            }
            return value;
        }
    } catch (e) {
        console.error('[Storage] Error getting stored items:', e);
    }

    return default_value;
};

export const getStoredItemsByKey = (storage_key: string, default_value: any) => {
    try {
        const session_storage_item = sessionStorage.getItem(storage_key);
        if (!session_storage_item) {
            return default_value;
        }
        const decompressed_item = LZString.decompress(session_storage_item);
        if (!decompressed_item) {
            return default_value;
        }
        const stored_items = JSON.parse(decompressed_item);

        if (stored_items && typeof stored_items === 'object') {
            return stored_items;
        }
    } catch (e) {
        console.error('[Storage] Error parsing stored items:', e);
    }

    return default_value;
};

export const setStoredItemsByKey = (storage_key: string, value: any) => {
    try {
        const compressed_value = LZString.compress(JSON.stringify(value));
        sessionStorage.setItem(storage_key, compressed_value);
    } catch (e) {
        console.warn('Could not write to storage.');
    }
};
