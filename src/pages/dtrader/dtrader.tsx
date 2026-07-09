import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import {
    generateDerivApiInstance,
    getMainAppActiveLoginId,
    getMainAppActiveToken,
    V2GetActiveToken,
} from '@/external/bot-skeleton/services/api/appId';
import { isNewLoggedIn, onNewSystemMessage, sendViaNewSystemWithPromise } from '@/auth/NewDerivAuth';
import { contract_stages } from '@/constants/contract-stage';
import { useStore } from '@/hooks/useStore';
import './dtrader.scss';

const TRADE_TYPES = [
    { value: 'CALL', label: 'Rise' },
    { value: 'PUT', label: 'Fall' },
    { value: 'CALLE', label: 'Rise =' },
    { value: 'PUTE', label: 'Fall =' },
    { value: 'ONETOUCH', label: 'Touch' },
    { value: 'NOTOUCH', label: 'No Touch' },
];

const DURATION_UNITS = [
    { value: 't', label: 'Ticks' },
    { value: 's', label: 'Seconds' },
    { value: 'm', label: 'Minutes' },
    { value: 'h', label: 'Hours' },
];

// ─── Original iframe URL builder (unchanged) ──────────────────────────────────
const buildIframeUrl = (token: string, loginId: string): string => {
    const clientAccountsStr = localStorage.getItem('clientAccounts') || '{}';
    const accountsListStr = localStorage.getItem('accountsList') || '{}';
    let currency = 'USD';

    try {
        const clientAccounts = JSON.parse(clientAccountsStr);
        const account = clientAccounts[loginId];
        if (account?.currency) {
            currency = account.currency;
        } else {
            const accountsList = JSON.parse(accountsListStr);
            const accountInfo = Object.keys(accountsList).find(key => key === loginId);
            if (accountInfo) {
                const accountData = JSON.parse(localStorage.getItem('accountList') || '[]');
                const acc = accountData.find((a: any) => a.loginid === loginId);
                if (acc?.currency) currency = acc.currency;
            }
        }
    } catch (error) {
        console.error('Error parsing clientAccounts:', error);
    }

    const appId = getAppId() || 114292;

    const params = new URLSearchParams({
        acct1: loginId,
        token1: token,
        cur1: currency,
        lang: 'EN',
        app_id: appId.toString(),
        chart_type: 'area',
        interval: '1t',
        symbol: '1HZ100V',
        trade_type: 'over_under',
        hide_bot: '1',
        bot_disabled: 'true',
        disable_bot: '1',
        no_bot: '1',
        manual_only: '1',
        hide_bot_controls: 'true',
    });

    return `https://deriv-dtrader.vercel.app/dtrader?${params.toString()}`;
};

const Dtrader = observer(() => {
    const store = useStore();
    const { run_panel, transactions } = store;

    // ── Iframe state (original logic) ──────────────────────────────────────────
    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [panelOpen, setPanelOpen] = useState(false);

    // ── Trading panel state ────────────────────────────────────────────────────
    const apiRef = useRef<any>(null);
    const tickSubIdRef = useRef<string | null>(null);
    const tickHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
    const pocHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
    const newSysUnsub = useRef<(() => void) | null>(null);

    const [currency, setCurrency] = useState('USD');
    const [symbols, setSymbols] = useState<{ symbol: string; display_name: string }[]>([]);
    const [symbol, setSymbol] = useState('1HZ100V');
    const [tradeType, setTradeType] = useState('CALL');
    const [durationUnit, setDurationUnit] = useState('t');
    const [duration, setDuration] = useState('5');
    const [stake, setStake] = useState('1.00');
    const [barrier, setBarrier] = useState('');
    const [lastTick, setLastTick] = useState('—');
    const [digits, setDigits] = useState<number[]>([]);
    const [proposalRise, setProposalRise] = useState<any>(null);
    const [proposalFall, setProposalFall] = useState<any>(null);
    const [proposalLoading, setProposalLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState('');
    const [tradeResult, setTradeResult] = useState<{ profit: number; type: 'win' | 'loss' } | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);

    // ── Original iframe logic ──────────────────────────────────────────────────
    const refreshIframe = useCallback(() => {
        const token = getMainAppActiveToken();
        const activeLoginId = getMainAppActiveLoginId();
        if (token && activeLoginId) {
            setIsAuthenticated(true);
            setIframeSrc(buildIframeUrl(token, activeLoginId));
        } else {
            setIsAuthenticated(false);
            setIframeSrc(
                'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
            );
        }
    }, []);

    useEffect(() => {
        refreshIframe();
    }, [refreshIframe]);

    useEffect(() => {
        const checkAuthAndUpdate = () => {
            const token = getMainAppActiveToken();
            const activeLoginId = getMainAppActiveLoginId();
            if (token && activeLoginId) {
                if (!isAuthenticated) setIsAuthenticated(true);
                setIframeSrc(buildIframeUrl(token, activeLoginId));
            } else if (isAuthenticated) {
                setIsAuthenticated(false);
                setIframeSrc(
                    'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
                );
            }
        };

        const handleStorageChange = (e: StorageEvent) => {
            if (['authToken', 'active_loginid', 'clientAccounts', 'accountsList', 'show_as_cr'].includes(e.key || '')) {
                checkAuthAndUpdate();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const interval = setInterval(checkAuthAndUpdate, 2000);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [isAuthenticated, refreshIframe]);

    // ── Trading API init ───────────────────────────────────────────────────────
    useEffect(() => {
        const api = generateDerivApiInstance();
        apiRef.current = api;

        api.send({ active_symbols: 'brief' })
            .then(({ active_symbols }: any) => {
                const list = (active_symbols || [])
                    .filter(
                        (s: any) =>
                            /synthetic/i.test(s.market) ||
                            /forex/i.test(s.market) ||
                            /^R_/.test(s.symbol) ||
                            /1HZ/.test(s.symbol)
                    )
                    .map((s: any) => ({ symbol: s.symbol, display_name: s.display_name }));
                setSymbols(list);
            })
            .catch(() => {/* noop */});

        startTicks('1HZ100V');

        return () => {
            stopTicks();
            try { api?.disconnect?.(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Tick stream ────────────────────────────────────────────────────────────
    const stopTicks = () => {
        try {
            if (tickSubIdRef.current) {
                apiRef.current?.forget({ forget: tickSubIdRef.current });
                tickSubIdRef.current = null;
            }
            if (tickHandlerRef.current) {
                apiRef.current?.connection?.removeEventListener('message', tickHandlerRef.current);
                tickHandlerRef.current = null;
            }
        } catch { /* noop */ }
    };

    const startTicks = async (sym: string) => {
        stopTicks();
        setDigits([]);
        setLastTick('—');
        try {
            const { subscription, error } = await apiRef.current.send({ ticks: sym, subscribe: 1 });
            if (error) throw error;
            if (subscription?.id) tickSubIdRef.current = subscription.id;

            const handler = (evt: MessageEvent) => {
                try {
                    const data = JSON.parse(evt.data);
                    if (data?.msg_type === 'tick' && data?.tick?.symbol === sym) {
                        const q = String(data.tick.quote);
                        setLastTick(q);
                        setDigits(prev => [...prev.slice(-8), Number(q.slice(-1))]);
                    }
                } catch { /* noop */ }
            };
            tickHandlerRef.current = handler;
            apiRef.current?.connection?.addEventListener('message', handler);
        } catch { /* noop */ }
    };

    // ── Proposals ──────────────────────────────────────────────────────────────
    const fetchProposals = useCallback(async () => {
        if (!symbol || !stake || !duration) return;
        setProposalLoading(true);
        setProposalRise(null);
        setProposalFall(null);

        const base: any = {
            proposal: 1,
            amount: Number(stake),
            basis: 'stake',
            currency,
            duration: Number(duration),
            duration_unit: durationUnit,
            symbol,
        };
        if (barrier && (tradeType === 'ONETOUCH' || tradeType === 'NOTOUCH')) base.barrier = barrier;

        try {
            const [r, f] = await Promise.all([
                isNewLoggedIn()
                    ? sendViaNewSystemWithPromise({ ...base, contract_type: 'CALL' })
                    : apiRef.current.send({ ...base, contract_type: 'CALL' }),
                isNewLoggedIn()
                    ? sendViaNewSystemWithPromise({ ...base, contract_type: 'PUT' })
                    : apiRef.current.send({ ...base, contract_type: 'PUT' }),
            ]);
            if (!r?.error) setProposalRise(r?.proposal);
            if (!f?.error) setProposalFall(f?.proposal);
        } catch { /* noop */ } finally {
            setProposalLoading(false);
        }
    }, [symbol, stake, duration, durationUnit, barrier, currency, tradeType]);

    useEffect(() => {
        const t = setTimeout(fetchProposals, 700);
        return () => clearTimeout(t);
    }, [fetchProposals]);

    // ── Auth ───────────────────────────────────────────────────────────────────
    const authorizeIfNeeded = async () => {
        if (isAuthorized) return;
        const loginid = getMainAppActiveLoginId();
        const token = getMainAppActiveToken();

        if (isNewLoggedIn() && (window as any)._newSystemWS?.readyState === WebSocket.OPEN) {
            let cur = 'USD';
            try {
                const ca = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
                cur = ca?.[loginid || '']?.currency || cur;
            } catch { /* noop */ }
            setIsAuthorized(true);
            setCurrency(cur);
            return;
        }

        const legacyToken = V2GetActiveToken() || token;
        if (!legacyToken) throw new Error('No token found. Please log in first.');

        const { authorize, error } = await apiRef.current.authorize(legacyToken);
        if (error) throw new Error(error.message || error.code);
        setIsAuthorized(true);
        setCurrency(authorize?.currency || 'USD');
    };

    // ── Buy ────────────────────────────────────────────────────────────────────
    const buyContract = async (direction: 'CALL' | 'PUT') => {
        setStatus('');
        setTradeResult(null);
        try {
            await authorizeIfNeeded();

            const effectiveType = direction === 'CALL'
                ? (tradeType.includes('CALL') || tradeType === 'ONETOUCH' ? tradeType : 'CALL')
                : (tradeType.includes('PUT') || tradeType === 'NOTOUCH' ? tradeType : 'PUT');

            const buyReq: any = {
                buy: '1',
                price: Number(stake),
                parameters: {
                    amount: Number(stake),
                    basis: 'stake',
                    contract_type: effectiveType,
                    currency,
                    duration: Number(duration),
                    duration_unit: durationUnit,
                    symbol,
                },
            };
            if (barrier && (effectiveType === 'ONETOUCH' || effectiveType === 'NOTOUCH')) {
                buyReq.parameters.barrier = barrier;
            }

            setStatus('Placing trade…');
            setIsRunning(true);

            const res = isNewLoggedIn()
                ? await sendViaNewSystemWithPromise(buyReq)
                : await apiRef.current.buy(buyReq);

            const { buy, error } = res || {};
            if (error) throw new Error(error.message || error.code);

            setStatus(`✓ Contract #${buy?.contract_id}`);

            run_panel.toggleDrawer(true);
            run_panel.setActiveTabIndex(1);
            run_panel.run_id = `dtrader-${Date.now()}`;
            run_panel.setIsRunning(true);
            run_panel.setContractStage(contract_stages.PURCHASE_SENT);
            run_panel.setHasOpenContract(true);

            try {
                const sym_display = symbols.find(s => s.symbol === symbol)?.display_name || symbol;
                transactions.onBotContractEvent({
                    contract_id: buy?.contract_id,
                    transaction_ids: { buy: buy?.transaction_id },
                    buy_price: buy?.buy_price,
                    currency,
                    contract_type: effectiveType as any,
                    underlying: symbol,
                    display_name: sym_display,
                    date_start: Math.floor(Date.now() / 1000),
                    status: 'open',
                } as any);
            } catch { /* noop */ }

            // Subscribe to contract result
            const pocReq = { proposal_open_contract: 1, contract_id: buy?.contract_id, subscribe: 1 };
            const pocRes = isNewLoggedIn()
                ? await sendViaNewSystemWithPromise(pocReq)
                : await apiRef.current.send(pocReq);

            if (!pocRes?.error) {
                let subId: string | null = pocRes?.subscription?.id || null;
                const targetId = String(buy?.contract_id || '');
                if (pocRes?.proposal_open_contract) transactions.onBotContractEvent(pocRes.proposal_open_contract);

                const pocHandler = (evt: MessageEvent) => {
                    try {
                        const data = JSON.parse(evt.data);
                        if (data?.msg_type === 'proposal_open_contract') {
                            const poc = data.proposal_open_contract;
                            if (!subId && data?.subscription?.id) subId = data.subscription.id;
                            if (String(poc?.contract_id || '') === targetId) {
                                transactions.onBotContractEvent(poc);
                                if (poc?.is_sold || poc?.status === 'sold') {
                                    const profit = Number(poc?.profit || 0);
                                    setTradeResult({ profit, type: profit > 0 ? 'win' : 'loss' });
                                    setStatus(profit > 0
                                        ? `✓ Won ${currency} ${Math.abs(profit).toFixed(2)}`
                                        : `✗ Lost ${currency} ${Math.abs(profit).toFixed(2)}`);
                                    run_panel.setContractStage(contract_stages.CONTRACT_CLOSED);
                                    run_panel.setHasOpenContract(false);
                                    run_panel.setIsRunning(false);
                                    setIsRunning(false);
                                    if (subId) apiRef.current?.forget?.({ forget: subId });
                                    apiRef.current?.connection?.removeEventListener('message', pocHandler);
                                    if (newSysUnsub.current) { newSysUnsub.current(); newSysUnsub.current = null; }
                                    fetchProposals();
                                }
                            }
                        }
                    } catch { /* noop */ }
                };

                pocHandlerRef.current = pocHandler;
                if (isNewLoggedIn()) {
                    newSysUnsub.current = onNewSystemMessage(pocHandler);
                } else {
                    apiRef.current?.connection?.addEventListener('message', pocHandler);
                }
            }
        } catch (e: any) {
            const msg = e?.message || 'Trade failed';
            setStatus(`Error: ${msg}`);
            setIsRunning(false);
            run_panel.setIsRunning(false);
            run_panel.setContractStage(contract_stages.NOT_RUNNING);
        }
    };

    const handleSymbolChange = (sym: string) => {
        setSymbol(sym);
        setProposalRise(null);
        setProposalFall(null);
        startTicks(sym);
    };

    const needsBarrier = tradeType === 'ONETOUCH' || tradeType === 'NOTOUCH';

    if (!iframeSrc) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Loading DTrader…</p>
            </div>
        );
    }

    return (
        <div className='dtrader-layout'>
            {/* ── Original DTrader iframe (unchanged) ── */}
            <div className='dtrader-layout__iframe'>
                <IframeWrapper src={iframeSrc} title='DTrader' className='dtrader-container' />
            </div>

            {/* ── Native trade panel toggle ── */}
            <button
                className={`dtrader-layout__toggle ${panelOpen ? 'dtrader-layout__toggle--open' : ''}`}
                onClick={() => setPanelOpen(p => !p)}
                title='Trade Panel'
            >
                {panelOpen ? '✕' : '⚡ Trade'}
            </button>

            {/* ── Native trade panel ── */}
            {panelOpen && (
                <div className='dtrader-layout__panel'>
                    <div className='dtp'>
                        <div className='dtp__head'>
                            <span className='dtp__title'>Bot Trade</span>
                            <span className='dtp__tick'>{lastTick}</span>
                        </div>

                        <div className='dtp__digits'>
                            {digits.map((d, i) => (
                                <span key={i} className='dtp__digit'>{d}</span>
                            ))}
                        </div>

                        <div className='dtp__field'>
                            <label>Market</label>
                            <select value={symbol} onChange={e => handleSymbolChange(e.target.value)} disabled={isRunning}>
                                {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.display_name}</option>)}
                            </select>
                        </div>

                        <div className='dtp__field'>
                            <label>Type</label>
                            <select value={tradeType} onChange={e => setTradeType(e.target.value)} disabled={isRunning}>
                                {TRADE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>

                        <div className='dtp__row'>
                            <div className='dtp__field'>
                                <label>Duration</label>
                                <input type='number' min='1' value={duration} onChange={e => setDuration(e.target.value)} disabled={isRunning} />
                            </div>
                            <div className='dtp__field'>
                                <label>Unit</label>
                                <select value={durationUnit} onChange={e => setDurationUnit(e.target.value)} disabled={isRunning}>
                                    {DURATION_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className='dtp__field'>
                            <label>Stake ({currency})</label>
                            <input type='number' step='0.01' min='0.35' value={stake} onChange={e => setStake(e.target.value)} disabled={isRunning} />
                        </div>

                        {needsBarrier && (
                            <div className='dtp__field'>
                                <label>Barrier</label>
                                <input type='text' placeholder='+0.005' value={barrier} onChange={e => setBarrier(e.target.value)} disabled={isRunning} />
                            </div>
                        )}

                        {proposalLoading && <div className='dtp__loading'>Loading prices…</div>}

                        <div className='dtp__buys'>
                            <button
                                className='dtp__buy dtp__buy--rise'
                                onClick={() => buyContract('CALL')}
                                disabled={isRunning || !symbol}
                            >
                                <span>▲ Rise</span>
                                {proposalRise && <small>{currency} {Number(proposalRise.payout || 0).toFixed(2)}</small>}
                            </button>
                            <button
                                className='dtp__buy dtp__buy--fall'
                                onClick={() => buyContract('PUT')}
                                disabled={isRunning || !symbol}
                            >
                                <span>▼ Fall</span>
                                {proposalFall && <small>{currency} {Number(proposalFall.payout || 0).toFixed(2)}</small>}
                            </button>
                        </div>

                        {status && (
                            <div className={`dtp__status ${tradeResult?.type === 'win' ? 'dtp__status--win' : tradeResult?.type === 'loss' ? 'dtp__status--loss' : ''}`}>
                                {status}
                            </div>
                        )}

                        {isRunning && (
                            <div className='dtp__running'>
                                <span className='dtp__spinner' /> In progress…
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default Dtrader;
