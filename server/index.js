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

/* ────────────────────────────────────────────
   GET /dtrader-proxy
   Server-side proxy for app.deriv.com/dtrader.
   Strips X-Frame-Options / CSP, rewrites asset
   paths to full deriv CDN URLs, neutralises the
   anti-iframe redirect, hides login/signup UI,
   and injects an auth-bridge postMessage script.
──────────────────────────────────────────── */
const DTRADER_ORIGIN = 'https://app.deriv.com';

app.get('/dtrader-proxy', async (req, res) => {
    try {
        const upstream = await fetch(`${DTRADER_ORIGIN}/dtrader`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        const allowedHeaders = ['content-type', 'cache-control', 'etag', 'last-modified', 'vary'];
        allowedHeaders.forEach(h => {
            const v = upstream.headers.get(h);
            if (v) res.set(h, v);
        });

        let html = await upstream.text();

        /* 1. Rewrite absolute-path asset references to full deriv CDN URLs */
        html = html
            .replace(/(['"\s])(\/js\/)/g,  `$1${DTRADER_ORIGIN}/js/`)
            .replace(/(['"\s])(\/css\/)/g,  `$1${DTRADER_ORIGIN}/css/`)
            .replace(/(['"\s])(\/public\/)/g, `$1${DTRADER_ORIGIN}/public/`)
            .replace(/(['"\s])(\/assets\/)/g, `$1${DTRADER_ORIGIN}/assets/`)
            .replace(/(['"\s])(\/static\/)/g, `$1${DTRADER_ORIGIN}/static/`)
            .replace(/(src|href)="\/(?!\/)/g, `$1="${DTRADER_ORIGIN}/`);

        /* 2. Neutralise anti-iframe redirect */
        html = html
            .replace(/else\s*top\.location\s*=\s*self\.location/g, 'else void(0)')
            .replace(/if\s*\(\s*self\s*===?\s*top\s*\)/g, 'if(false)')
            .replace(/if\s*\(\s*window\.top\s*!==?\s*window\.self\s*\)/g, 'if(false)')
            .replace(/<style[^>]*id=["']antiClickjack["'][^>]*>[\s\S]*?<\/style>/gi,
                     '<style id="antiClickjack"></style>');

        /* 3. Inject hide-login CSS + auth-bridge script before </head> */
        const injection = `
<style>
  .account-header__logged-out,
  .account-header__login,
  .account-header__signup,
  [class*="login-signup"],
  [class*="login_signup"],
  button[class*="login"],
  button[class*="signup"] { display: none !important; }
</style>
<script>
(function () {
  function writeAuth(data) {
    try {
      if (!data || !data.accountsList) return;
      var accounts = {};
      data.accountsList.forEach(function(acc) {
        accounts[acc.loginid] = { token: acc.token, currency: acc.currency || 'USD' };
      });
      localStorage.setItem('client.accounts', JSON.stringify(accounts));
      if (data.activeLoginid) {
        localStorage.setItem('active_loginid', data.activeLoginid);
      }
    } catch(e) {}
  }
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'DT_AUTH_DATA') return;
    writeAuth(e.data.payload);
    if (document.readyState === 'complete') location.reload();
    else window.addEventListener('load', function() { location.reload(); }, {once:true});
  });
  window.parent.postMessage({ type: 'DT_REQUEST_AUTH' }, '*');
  setTimeout(function() {
    window.parent.postMessage({ type: 'DT_REQUEST_AUTH' }, '*');
  }, 2000);
})();
</script>`;

        html = html.replace('</head>', injection + '</head>');

        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        res.status(502).send(`<h2>DTrader proxy error</h2><pre>${err.message}</pre>`);
    }
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deriv API backend ready on port ${PORT}`);
});
