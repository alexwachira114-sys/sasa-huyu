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
   Proxies app.deriv.com/dtrader for iframe embed.
   - Strips X-Frame-Options / CSP
   - Rewrites asset paths to full CDN URLs
   - Neutralises anti-iframe redirect
   - Hides login/signup buttons via CSS
   - Bridges auth via postMessage (AUTH_TOKEN)
──────────────────────────────────────────── */
const DTRADER_TARGET = 'https://deriv-dtrader.vercel.app';

app.get('/dtrader-proxy', async (req, res) => {
    try {
        const queryStr = Object.keys(req.query).length
            ? '?' + new URLSearchParams(req.query).toString()
            : '';
        const upstream = await fetch(`${DTRADER_TARGET}/dtrader${queryStr}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        let html = await upstream.text();

        /* 1 — Inject base href so all relative assets resolve against original domain */
        html = html.replace('<head>', `<head><base href="${DTRADER_TARGET}/">`);

        /* 2 — Strip the entire Anti-Clickjack block (style + script) */
        html = html
            .replace(/<!-- Start Anti-Clickjack -->[\s\S]*?<!-- End Anti-Clickjack -->/gi, '')
            .replace(/else\s*\{?\s*top\.location\s*=\s*self\.location\s*;?\s*\}?/g, 'else void(0)')
            .replace(/if\s*\(\s*self\s*===?\s*top\s*\)/g, 'if(true)')
            .replace(/if\s*\(\s*window\.top\s*!==?\s*window\.self\s*\)/g, 'if(false)')
            .replace(/<style[^>]*id=["']antiClickjack["'][^>]*>[\s\S]*?<\/style>/gi, '');

        /* 3 — Inject window.top patch + auth bridge before </head> */
        const injection = `
<script>
/* Patch window.top so the Deriv app thinks it is NOT inside an iframe.
   This must run before any deferred/async scripts to neutralise all
   anti-clickjack checks in the React bundle. */
(function () {
  try {
    Object.defineProperty(window, 'top', {
      get: function () { return window.self; },
      configurable: true
    });
  } catch (e) {}
})();
</script>
<style>
  /* Hide login/signup — project has its own auth */
  .account-header__logged-out,
  .account-header__login,
  .account-header__signup,
  [class*="login-signup"],
  [class*="login_signup"],
  button[class*="login"],
  button[class*="signup"],
  [class*="LoginButton"],
  [class*="SignupButton"] { display: none !important; }
</style>
<script>
(function () {
  /* Write account data into localStorage in the format DTrader reads */
  function applyAuth(data) {
    try {
      if (data.token && data.loginid) {
        var accounts = {};
        try { accounts = JSON.parse(localStorage.getItem('client.accounts') || '{}'); } catch(e) {}
        accounts[data.loginid] = { token: data.token, currency: 'USD' };
        localStorage.setItem('client.accounts', JSON.stringify(accounts));
        localStorage.setItem('active_loginid', data.loginid);
      }
    } catch(e) {}
  }

  /* Listen for AUTH_TOKEN messages from the parent (IframeWrapper sends these) */
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    /* IframeWrapper format: { type: 'AUTH_TOKEN', token, loginid, appId } */
    if (e.data.type === 'AUTH_TOKEN') {
      applyAuth(e.data);
      return;
    }
    /* Legacy format used by our proxy */
    if (e.data.type === 'DT_AUTH_DATA' && e.data.payload) {
      var p = e.data.payload;
      if (p.accountsList) {
        var accounts = {};
        p.accountsList.forEach(function(a) {
          accounts[a.loginid] = { token: a.token, currency: a.currency || 'USD' };
        });
        localStorage.setItem('client.accounts', JSON.stringify(accounts));
        if (p.activeLoginid) localStorage.setItem('active_loginid', p.activeLoginid);
      }
    }
  });

  /* Ask parent for auth immediately and again after 2 s */
  window.parent.postMessage({ type: 'REQUEST_AUTH' }, '*');
  setTimeout(function() { window.parent.postMessage({ type: 'REQUEST_AUTH' }, '*'); }, 2000);
})();
</script>`;

        html = html.replace('</head>', injection + '</head>');

        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', 'frame-ancestors *');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(html);
    } catch (err) {
        res.status(502).send(`<h2>DTrader proxy error</h2><pre>${err.message}</pre>`);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deriv API backend ready on port ${PORT}`);
});
