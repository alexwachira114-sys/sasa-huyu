'use strict';

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const fetch        = require('node-fetch');

const app  = express();
const PORT = 3001;

const DERIV_TOKEN_URL  = 'https://auth.deriv.com/oauth2/token';
const DERIV_REST_BASE  = 'https://api.derivws.com';
const CLIENT_ID        = '33yhUhHxbgeMydLnQehYK';
const ACCESS_TOKEN_COOKIE = 'deriv_at';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ────────────────────────────────────────────
   POST /api/auth/token
   Body: { code, codeVerifier, redirectUri }
   Exchanges the PKCE auth code for an access_token
   and stores it in an httpOnly cookie.
──────────────────────────────────────────── */
app.post('/api/auth/token', async (req, res) => {
    const { code, codeVerifier, redirectUri } = req.body;

    if (!code || !codeVerifier || !redirectUri) {
        res.status(400).json({ error: 'Missing required parameters: code, codeVerifier, redirectUri' });
        return;
    }

    try {
        const tokenRes = await fetch(DERIV_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'authorization_code',
                client_id:     CLIENT_ID,
                code,
                code_verifier: codeVerifier,
                redirect_uri:  redirectUri,
            }).toString(),
        });

        const raw = await tokenRes.text();

        if (!tokenRes.ok) {
            res.status(tokenRes.status).json({ error: raw });
            return;
        }

        let tokenData;
        try { tokenData = JSON.parse(raw); }
        catch { res.status(500).json({ error: 'Unparseable token response', raw }); return; }

        if (tokenData.error) {
            res.status(400).json({ error: tokenData.error, description: tokenData.error_description });
            return;
        }

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            res.status(500).json({ error: 'No access_token in response' });
            return;
        }

        const maxAge = (tokenData.expires_in || 3600) * 1000;

        res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge,
            path: '/',
        });

        res.json({ success: true, expires_in: tokenData.expires_in || 3600 });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Token exchange failed' });
    }
});

/* GET /api/auth/status — check whether a cookie is present */
app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: !!req.cookies[ACCESS_TOKEN_COOKIE] });
});

/* POST /api/auth/logout — clear the cookie */
app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.json({ success: true });
});

/* ────────────────────────────────────────────
   Proxy all /api/trading/* calls to Deriv REST.
   The access_token is read from the httpOnly cookie
   and added as a Bearer header server-side.
──────────────────────────────────────────── */
// Mount trading proxy as middleware so path-to-regexp isn't used for wildcard matching
app.use('/api/trading', async (req, res) => {
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE];
    if (!accessToken) {
        res.status(401).json({ error: 'Not authenticated — please log in first.' });
        return;
    }

    const method   = req.method;
    const queryStr = Object.keys(req.query).length
        ? '?' + new URLSearchParams(req.query).toString()
        : '';
    const url = `${DERIV_REST_BASE}/trading${req.url.split('?')[0]}${queryStr}`;

    try {
        const upstream = await fetch(url, {
            method,
            headers: {
                Authorization:  `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(req.body) : undefined,
        });

        let data;
        try { data = await upstream.json(); }
        catch { data = { raw: await upstream.text() }; }

        res.status(upstream.status).json(data);
    } catch (err) {
        res.status(502).json({ error: err.message || 'Upstream request failed' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deriv API backend ready on port ${PORT}`);
});
