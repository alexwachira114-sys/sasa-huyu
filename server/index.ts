import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

const DERIV_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';
const DERIV_REST_BASE = 'https://api.derivws.com';
const CLIENT_ID = '33yhUhHxbgeMydLnQehYK';
const ACCESS_TOKEN_COOKIE = 'deriv_at';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.post('/api/auth/token', async (req, res) => {
    const { code, codeVerifier, redirectUri } = req.body as {
        code?: string;
        codeVerifier?: string;
        redirectUri?: string;
    };

    if (!code || !codeVerifier || !redirectUri) {
        res.status(400).json({ error: 'Missing required parameters: code, codeVerifier, redirectUri' });
        return;
    }

    try {
        const tokenRes = await fetch(DERIV_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
            }).toString(),
        });

        const raw = await tokenRes.text();

        if (!tokenRes.ok) {
            res.status(tokenRes.status).json({ error: raw });
            return;
        }

        const tokenData = JSON.parse(raw) as {
            access_token?: string;
            expires_in?: number;
            token_type?: string;
            error?: string;
            error_description?: string;
        };

        if (tokenData.error) {
            res.status(400).json({ error: tokenData.error, description: tokenData.error_description });
            return;
        }

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            res.status(500).json({ error: 'No access_token in token response' });
            return;
        }

        const maxAge = (tokenData.expires_in ?? 3600) * 1000;

        res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge,
            path: '/',
        });

        res.json({ success: true, expires_in: tokenData.expires_in ?? 3600 });
    } catch (err: any) {
        res.status(500).json({ error: err?.message ?? 'Token exchange failed' });
    }
});

app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: !!req.cookies[ACCESS_TOKEN_COOKIE] });
});

app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.json({ success: true });
});

async function proxyToRest(
    req: express.Request,
    res: express.Response,
    method: 'GET' | 'POST'
) {
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE] as string | undefined;
    if (!accessToken) {
        res.status(401).json({ error: 'Not authenticated — please log in first.' });
        return;
    }

    const subPath = req.path.replace(/^\/api\/trading/, '');
    const queryStr =
        method === 'GET' && Object.keys(req.query).length
            ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
            : '';
    const url = `${DERIV_REST_BASE}/trading${subPath}${queryStr}`;

    try {
        const upstream = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: method === 'POST' ? JSON.stringify(req.body) : undefined,
        });

        const data = await upstream.json() as object;
        res.status(upstream.status).json(data);
    } catch (err: any) {
        res.status(502).json({ error: err?.message ?? 'Upstream request failed' });
    }
}

app.get('/api/trading/*', (req, res) => proxyToRest(req, res, 'GET'));
app.post('/api/trading/*', (req, res) => proxyToRest(req, res, 'POST'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deriv API backend ready on port ${PORT}`);
});
