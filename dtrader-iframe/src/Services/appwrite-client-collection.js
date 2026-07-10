import { Account, Client, Databases, ID, Query } from 'appwrite';

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID =
    process.env.APPWRITE_CLIENTS_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '65fd057cb22be40ed1c7';
const APPWRITE_DATABASE_ID = process.env.APPWRITE_CLIENTS_DATABASE_ID || '69f96dc80009b67d09b9';
const APPWRITE_COLLECTION_ID = process.env.APPWRITE_CLIENTS_COLLECTION_ID || 'clients';
const PAGE_SIZE = 100;

let _client = null;
let _account = null;
let _databases = null;

const getSdk = () => {
    if (_client && _account && _databases) return { account: _account, databases: _databases };
    _client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
    _account = new Account(_client);
    _databases = new Databases(_client);
    return { account: _account, databases: _databases };
};

const ensureAnonymousSession = async appwrite_account => {
    try {
        await appwrite_account.get();
    } catch {
        await appwrite_account.createAnonymousSession();
    }
};

const normalizeEmail = email => email?.trim().toLowerCase() || '';

const hashId = value => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(36);
};

const getDocumentId = (domain, email) => {
    const raw = `client_${hashId(`${domain}:${normalizeEmail(email)}`)}`;
    return raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 36) || ID.unique();
};

export const trackClientLogin = async ({ email, firstName, lastName, fullname, loginId, status }) => {
    const normalized_email = normalizeEmail(email);
    if (!normalized_email) return;

    const domain = window.location.hostname;
    const { account, databases } = getSdk();
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || fullname?.trim() || '';
    const data = { name, email: normalized_email, domain, status: status || 'legacy' };
    const doc_id = getDocumentId(domain, normalized_email);

    try {
        await ensureAnonymousSession(account);

        let target_id = doc_id;
        try {
            const existing = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, [
                Query.equal('domain', domain),
                Query.equal('email', normalized_email),
                Query.orderDesc('$updatedAt'),
                Query.limit(1),
            ]);
            target_id = existing.documents[0]?.$id || doc_id;
        } catch {
            target_id = doc_id;
        }

        try {
            await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, target_id, data);
        } catch {
            try {
                await databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    APPWRITE_COLLECTION_ID,
                    ID.custom(doc_id),
                    data
                );
            } catch {
                await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, doc_id, data);
            }
        }
    } catch {
        // Non-critical — do not disrupt the login flow
    }
};

export const listClientsForDomain = async (domain = window.location.hostname) => {
    const { account, databases } = getSdk();
    await ensureAnonymousSession(account);

    const docs = [];
    let cursor;
    do {
        const result = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, [
            Query.equal('domain', domain),
            Query.orderDesc('$updatedAt'),
            Query.limit(PAGE_SIZE),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);
        docs.push(...result.documents);
        cursor = result.documents.at(-1)?.$id;
        if (result.documents.length < PAGE_SIZE) break;
    } while (cursor);

    return docs;
};
