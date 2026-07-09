import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
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
    { value: 'CALLE', label: 'Rise Equals' },
    { value: 'PUTE', label: 'Fall Equals' },
    { value: 'ONETOUCH', label: 'Touch' },
    { value: 'NOTOUCH', label: 'No Touch' },
];

const DURATION_UNITS = [
    { value: 't', label: 'Ticks' },
    { value: 's', label: 'Seconds' },
    { value: 'm', label: 'Minutes' },
    { value: 'h', label: 'Hours' },
];

const Dtrader = observer(() => {
    const store = useStore();
    const { run_panel, transactions } = store;

    const apiRef = useRef<any>(null);
    const tickSubIdRef = useRef<string | null>(null);
    const tickHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
    const newSysUnsubRef = useRef<(() => void) | null>(null);
    const proposalSubIdRef = useRef<string | null>(null);
    const stopFlagRef = useRef<boolean>(false);

    const [isAuthorized, setIsAuthorized] = useState(false);
    const [currency, setCurrency] = useState('USD');
    const [symbols, setSymbols] = useState<{ symbol: string; display_name: string }[]>([]);
    const [symbol, setSymbol] = useState('');
    const [tradeType, setTradeType] = useState('CALL');
    const [durationUnit, setDurationUnit] = useState('t');
    const [duration, setDuration] = useState('5');
    const [stake, setStake] = useState('1.00');
    const [barrier, setBarrier] = useState('');

    const [digits, setDigits] = useState<number[]>([]);
    const [lastTick, setLastTick] = useState<string>('—');
    const [tickCount, setTickCount] = useState(0);

    const [proposalRise, setProposalRise] = useState<any>(null);
    const [proposalFall, setProposalFall] = useState<any>(null);
    const [proposalLoading, setProposalLoading] = useState(false);

    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState('');
    const [tradeResult, setTradeResult] = useState<{ profit: number; status: string } | null>(null);

    // ── Init API & symbols ─────────────────────────────────────────
    useEffect(() => {
        const api = generateDerivApiInstance();
        apiRef.current = api;

        const init = async () => {
            try {
                const { active_symbols } = await api.send({ active_symbols: 'brief' });
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
                const defaultSym = list.find((s: any) => s.symbol === '1HZ100V') || list[0];
                if (defaultSym) {
                    setSymbol(defaultSym.symbol);
                    startTicks(defaultSym.symbol);
                }
            } catch (e: any) {
                setStatus(`Init error: ${e?.message || 'Failed to load symbols'}`);
            }
        };
        init();

        return () => {
            stopTicks();
            try { api?.disconnect?.(); } catch { /* noop */ }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Tick stream ────────────────────────────────────────────────
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
            if (newSysUnsubRef.current) {
                newSysUnsubRef.current();
                newSysUnsubRef.current = null;
            }
        } catch { /* noop */ }
    };

    const startTicks = async (sym: string) => {
        stopTicks();
        setDigits([]);
        setLastTick('—');
        setTickCount(0);
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
                        const digit = Number(q.slice(-1));
                        setDigits(prev => [...prev.slice(-8), digit]);
                        setTickCount(prev => prev + 1);
                    }
                } catch { /* noop */ }
            };
            tickHandlerRef.current = handler;
            apiRef.current?.connection?.addEventListener('message', handler);
        } catch (e: any) {
            console.error('DTrader startTicks error', e);
        }
    };

    // ── Proposal ───────────────────────────────────────────────────
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
        if (barrier && (tradeType === 'ONETOUCH' || tradeType === 'NOTOUCH')) {
            base.barrier = barrier;
        }

        try {
            const [riseRes, fallRes] = await Promise.all([
                isNewLoggedIn()
                    ? sendViaNewSystemWithPromise({ ...base, contract_type: 'CALL' })
                    : apiRef.current.send({ ...base, contract_type: 'CALL' }),
                isNewLoggedIn()
                    ? sendViaNewSystemWithPromise({ ...base, contract_type: 'PUT' })
                    : apiRef.current.send({ ...base, contract_type: 'PUT' }),
            ]);
            if (!riseRes?.error) setProposalRise(riseRes?.proposal);
            if (!fallRes?.error) setProposalFall(fallRes?.proposal);
        } catch (e: any) {
            console.error('DTrader proposal error', e);
        } finally {
            setProposalLoading(false);
        }
    }, [symbol, stake, duration, durationUnit, barrier, currency, tradeType]);

    useEffect(() => {
        const t = setTimeout(fetchProposals, 600);
        return () => clearTimeout(t);
    }, [fetchProposals]);

    // ── Auth ───────────────────────────────────────────────────────
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

    // ── Buy ────────────────────────────────────────────────────────
    const buyContract = async (direction: 'CALL' | 'PUT') => {
        setStatus('');
        setTradeResult(null);
        try {
            await authorizeIfNeeded();

            const contractType =
                direction === 'CALL'
                    ? tradeType === 'PUT' || tradeType === 'PUTE'
                        ? 'CALL'
                        : tradeType === 'NOTOUCH'
                        ? 'ONETOUCH'
                        : tradeType
                    : tradeType === 'CALL' || tradeType === 'CALLE'
                    ? 'PUT'
                    : tradeType === 'ONETOUCH'
                    ? 'NOTOUCH'
                    : tradeType;

            const effectiveType = direction === 'CALL' ? (tradeType.includes('CALL') || tradeType === 'ONETOUCH' ? tradeType : 'CALL') : (tradeType.includes('PUT') || tradeType === 'NOTOUCH' ? tradeType : 'PUT');

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
            const res = isNewLoggedIn()
                ? await sendViaNewSystemWithPromise(buyReq)
                : await apiRef.current.buy(buyReq);

            const { buy, error } = res || {};
            if (error) throw new Error(error.message || error.code);

            setStatus(`✓ Trade placed — Contract #${buy?.contract_id}`);
            setIsRunning(true);
            stopFlagRef.current = false;

            run_panel.toggleDrawer(true);
            run_panel.setActiveTabIndex(1);
            run_panel.run_id = `dtrader-${Date.now()}`;
            run_panel.setIsRunning(true);
            run_panel.setContractStage(contract_stages.PURCHASE_SENT);
            run_panel.setHasOpenContract(true);

            // Seed transaction row
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

            // Subscribe to contract updates
            try {
                const pocReq = { proposal_open_contract: 1, contract_id: buy?.contract_id, subscribe: 1 };
                const pocRes = isNewLoggedIn()
                    ? await sendViaNewSystemWithPromise(pocReq)
                    : await apiRef.current.send(pocReq);

                if (!pocRes?.error) {
                    let subId: string | null = pocRes?.subscription?.id || null;
                    const targetId = String(buy?.contract_id || '');

                    if (pocRes?.proposal_open_contract) {
                        transactions.onBotContractEvent(pocRes.proposal_open_contract);
                    }

                    const pocHandler = (evt: MessageEvent) => {
                        try {
                            const data = JSON.parse(evt.data);
                            if (data?.msg_type === 'proposal_open_contract') {
                                const poc = data.proposal_open_contract;
                                if (!subId && data?.subscription?.id) subId = data.subscription.id;
                                if (String(poc?.contract_id || '') === targetId) {
                                    transactions.onBotContractEvent(poc);
                                    run_panel.setHasOpenContract(true);
                                    if (poc?.is_sold || poc?.status === 'sold') {
                                        const profit = Number(poc?.profit || 0);
                                        setTradeResult({ profit, status: profit > 0 ? 'win' : 'loss' });
                                        setStatus(
                                            profit > 0
                                                ? `✓ Won ${currency} ${Math.abs(profit).toFixed(2)}`
                                                : `✗ Lost ${currency} ${Math.abs(profit).toFixed(2)}`
                                        );
                                        run_panel.setContractStage(contract_stages.CONTRACT_CLOSED);
                                        run_panel.setHasOpenContract(false);
                                        setIsRunning(false);
                                        run_panel.setIsRunning(false);
                                        if (subId) apiRef.current?.forget?.({ forget: subId });
                                        apiRef.current?.connection?.removeEventListener('message', pocHandler);
                                        fetchProposals();
                                    }
                                }
                            }
                        } catch { /* noop */ }
                    };

                    if (isNewLoggedIn()) {
                        const unsub = onNewSystemMessage(pocHandler);
                        proposalSubIdRef.current = subId;
                        const origUnsub = unsub;
                        newSysUnsubRef.current = () => { origUnsub(); };
                    } else {
                        apiRef.current?.connection?.addEventListener('message', pocHandler);
                    }
                }
            } catch (subErr) {
                console.error('DTrader poc subscribe error', subErr);
            }
        } catch (e: any) {
            const msg = e?.message || e?.error?.message || 'Trade failed';
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
        setDigits([]);
        setLastTick('—');
        setTickCount(0);
        startTicks(sym);
    };

    const isRiseType = tradeType === 'CALL' || tradeType === 'CALLE' || tradeType === 'ONETOUCH';
    const isFallType = tradeType === 'PUT' || tradeType === 'PUTE' || tradeType === 'NOTOUCH';
    const needsBarrier = tradeType === 'ONETOUCH' || tradeType === 'NOTOUCH';

    return (
        <div className='dtrader-native'>
            <div className='dtrader-native__layout'>

                {/* ── Left panel: controls ─────────────────────── */}
                <div className='dtrader-native__panel'>
                    <div className='dtrader-native__header'>
                        <span className='dtrader-native__logo'>DTrader</span>
                        <span className='dtrader-native__tag'>Live Trading</span>
                    </div>

                    {/* Symbol */}
                    <div className='dtrader-native__field'>
                        <label className='dtrader-native__label'>Market</label>
                        <select
                            className='dtrader-native__select'
                            value={symbol}
                            onChange={e => handleSymbolChange(e.target.value)}
                            disabled={isRunning}
                        >
                            {symbols.map(s => (
                                <option key={s.symbol} value={s.symbol}>{s.display_name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Trade type */}
                    <div className='dtrader-native__field'>
                        <label className='dtrader-native__label'>Contract Type</label>
                        <select
                            className='dtrader-native__select'
                            value={tradeType}
                            onChange={e => setTradeType(e.target.value)}
                            disabled={isRunning}
                        >
                            {TRADE_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Duration */}
                    <div className='dtrader-native__field'>
                        <label className='dtrader-native__label'>Duration</label>
                        <div className='dtrader-native__duration-row'>
                            <input
                                className='dtrader-native__input dtrader-native__input--duration'
                                type='number'
                                min='1'
                                value={duration}
                                onChange={e => setDuration(e.target.value)}
                                disabled={isRunning}
                            />
                            <select
                                className='dtrader-native__select dtrader-native__select--unit'
                                value={durationUnit}
                                onChange={e => setDurationUnit(e.target.value)}
                                disabled={isRunning}
                            >
                                {DURATION_UNITS.map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Stake */}
                    <div className='dtrader-native__field'>
                        <label className='dtrader-native__label'>Stake ({currency})</label>
                        <input
                            className='dtrader-native__input'
                            type='number'
                            step='0.01'
                            min='0.35'
                            value={stake}
                            onChange={e => setStake(e.target.value)}
                            disabled={isRunning}
                        />
                    </div>

                    {/* Barrier (for touch/no touch) */}
                    {needsBarrier && (
                        <div className='dtrader-native__field'>
                            <label className='dtrader-native__label'>Barrier</label>
                            <input
                                className='dtrader-native__input'
                                type='text'
                                placeholder='e.g. +0.005'
                                value={barrier}
                                onChange={e => setBarrier(e.target.value)}
                                disabled={isRunning}
                            />
                        </div>
                    )}

                    {/* Live tick */}
                    <div className='dtrader-native__tick-box'>
                        <div className='dtrader-native__tick-label'>Last Tick</div>
                        <div className='dtrader-native__tick-value'>{lastTick}</div>
                        <div className='dtrader-native__digits'>
                            {digits.map((d, i) => (
                                <span key={i} className='dtrader-native__digit'>{d}</span>
                            ))}
                        </div>
                        <div className='dtrader-native__tick-count'>Ticks: {tickCount}</div>
                    </div>

                    {/* Proposal pricing */}
                    <div className='dtrader-native__proposals'>
                        {proposalLoading && <div className='dtrader-native__proposal-loading'>Loading prices…</div>}
                        {proposalRise && (
                            <div className='dtrader-native__proposal dtrader-native__proposal--rise'>
                                <span>Rise payout</span>
                                <strong>{currency} {Number(proposalRise.payout || 0).toFixed(2)}</strong>
                            </div>
                        )}
                        {proposalFall && (
                            <div className='dtrader-native__proposal dtrader-native__proposal--fall'>
                                <span>Fall payout</span>
                                <strong>{currency} {Number(proposalFall.payout || 0).toFixed(2)}</strong>
                            </div>
                        )}
                    </div>

                    {/* Buy buttons */}
                    <div className='dtrader-native__buy-row'>
                        <button
                            className='dtrader-native__buy-btn dtrader-native__buy-btn--rise'
                            onClick={() => buyContract('CALL')}
                            disabled={isRunning || !symbol}
                        >
                            <span className='dtrader-native__btn-arrow'>▲</span>
                            <span>
                                {tradeType === 'ONETOUCH' ? 'Touch' : tradeType === 'CALLE' ? 'Rise =' : 'Rise'}
                            </span>
                            {proposalRise && (
                                <small>{currency} {Number(proposalRise.payout || 0).toFixed(2)}</small>
                            )}
                        </button>

                        <button
                            className='dtrader-native__buy-btn dtrader-native__buy-btn--fall'
                            onClick={() => buyContract('PUT')}
                            disabled={isRunning || !symbol}
                        >
                            <span className='dtrader-native__btn-arrow'>▼</span>
                            <span>
                                {tradeType === 'NOTOUCH' ? 'No Touch' : tradeType === 'PUTE' ? 'Fall =' : 'Fall'}
                            </span>
                            {proposalFall && (
                                <small>{currency} {Number(proposalFall.payout || 0).toFixed(2)}</small>
                            )}
                        </button>
                    </div>

                    {/* Status */}
                    {status && (
                        <div className={`dtrader-native__status ${tradeResult?.status === 'win' ? 'dtrader-native__status--win' : tradeResult?.status === 'loss' ? 'dtrader-native__status--loss' : ''}`}>
                            {status}
                        </div>
                    )}

                    {isRunning && (
                        <div className='dtrader-native__running'>
                            <span className='dtrader-native__spinner' />
                            Contract in progress…
                        </div>
                    )}
                </div>

                {/* ── Right: live feed ─────────────────────────── */}
                <div className='dtrader-native__feed'>
                    <div className='dtrader-native__feed-header'>
                        <span>Live Market Feed</span>
                        <span className='dtrader-native__live-dot' />
                    </div>
                    <div className='dtrader-native__feed-symbol'>
                        {symbols.find(s => s.symbol === symbol)?.display_name || symbol}
                    </div>
                    <div className='dtrader-native__feed-price'>{lastTick}</div>
                    <div className='dtrader-native__digit-row'>
                        {digits.map((d, i) => (
                            <div key={i} className={`dtrader-native__feed-digit dtrader-native__feed-digit--${d % 2 === 0 ? 'even' : 'odd'}`}>
                                {d}
                            </div>
                        ))}
                    </div>

                    <div className='dtrader-native__info-grid'>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Stake</div>
                            <div className='dtrader-native__info-value'>{currency} {stake}</div>
                        </div>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Duration</div>
                            <div className='dtrader-native__info-value'>{duration} {DURATION_UNITS.find(u => u.value === durationUnit)?.label}</div>
                        </div>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Contract</div>
                            <div className='dtrader-native__info-value'>{TRADE_TYPES.find(t => t.value === tradeType)?.label}</div>
                        </div>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Status</div>
                            <div className={`dtrader-native__info-value ${isRunning ? 'dtrader-native__info-value--active' : ''}`}>
                                {isRunning ? 'Active' : 'Ready'}
                            </div>
                        </div>
                    </div>

                    {tradeResult && (
                        <div className={`dtrader-native__result dtrader-native__result--${tradeResult.status}`}>
                            {tradeResult.status === 'win' ? '🏆 Win' : '❌ Loss'}
                            <div className='dtrader-native__result-amount'>
                                {tradeResult.profit > 0 ? '+' : ''}{currency} {tradeResult.profit.toFixed(2)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default Dtrader;
