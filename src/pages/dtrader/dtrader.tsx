import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import './dtrader.scss';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useStore } from '@/hooks/useStore';
import { contract_stages } from '@/constants/contract-stage';

// ─── Contract categories ──────────────────────────────────────────────────────
const CATEGORIES = {
    rise_fall: { label: 'Rise / Fall', types: ['CALL', 'PUT'], needsBarrier: false },
    over_under: { label: 'Over / Under', types: ['DIGITOVER', 'DIGITUNDER'], needsBarrier: true },
    even_odd: { label: 'Even / Odd', types: ['DIGITEVEN', 'DIGITODD'], needsBarrier: false },
    matches_differs: {
        label: 'Matches / Differs',
        types: ['DIGITMATCH', 'DIGITDIFF'],
        needsBarrier: true,
    },
} as const;

type CategoryKey = keyof typeof CATEGORIES;

const TYPE_LABELS: Record<string, { label: string; arrow: string; side: 'rise' | 'fall' }> = {
    CALL: { label: 'Rise', arrow: '▲', side: 'rise' },
    PUT: { label: 'Fall', arrow: '▼', side: 'fall' },
    DIGITOVER: { label: 'Over', arrow: '▲', side: 'rise' },
    DIGITUNDER: { label: 'Under', arrow: '▼', side: 'fall' },
    DIGITEVEN: { label: 'Even', arrow: '◆', side: 'rise' },
    DIGITODD: { label: 'Odd', arrow: '◇', side: 'fall' },
    DIGITMATCH: { label: 'Matches', arrow: '=', side: 'rise' },
    DIGITDIFF: { label: 'Differs', arrow: '≠', side: 'fall' },
};

interface ProposalData {
    id: string;
    price: string;
    payout: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
const Dtrader = observer(() => {
    const { transactions, run_panel, client } = useStore();

    // ── Trade parameters ──────────────────────────────────────────────────────
    const [symbol, setSymbol] = useState('1HZ100V');
    const [category, setCategory] = useState<CategoryKey>('rise_fall');
    const [duration, setDuration] = useState(5);
    const [durationUnit, setDurationUnit] = useState('t');
    const [stake, setStake] = useState(1);
    const [barrier, setBarrier] = useState(5);

    // ── Market data ───────────────────────────────────────────────────────────
    const [availableSymbols, setAvailableSymbols] = useState<{ value: string; label: string }[]>([]);
    const [currentPrice, setCurrentPrice] = useState('—');
    const [digitHistory, setDigitHistory] = useState<number[]>([]);
    const [tickCount, setTickCount] = useState(0);

    // ── Proposals ─────────────────────────────────────────────────────────────
    const [proposals, setProposals] = useState<Record<string, ProposalData | null>>({});
    const [proposalsLoading, setProposalsLoading] = useState(false);

    // ── Trade state ───────────────────────────────────────────────────────────
    const [isTrading, setIsTrading] = useState(false);
    const [status, setStatus] = useState('');
    const [statusType, setStatusType] = useState<'default' | 'win' | 'loss'>('default');
    const [apiReady, setApiReady] = useState(false);

    // ── Subscription / session tracking refs ──────────────────────────────────
    // Monotonically-increasing session counter — incremented each time trade
    // params change. Proposal requests carry it as `passthrough.dtSess`; on
    // response we discard any message whose session doesn't match the current
    // value, eliminating the stale-proposal race condition.
    const proposalSessionRef = useRef(0);

    // Server-assigned IDs for subscriptions we own, used for targeted `forget`.
    const tickSubIdRef = useRef<string | null>(null);
    const proposalSubIdsRef = useRef<string[]>([]); // proposal subscription server IDs

    // The contract ID we bought and are waiting on for settlement.
    const activeContractIdRef = useRef<string | null>(null);

    // Single message-listener cleanup handle.
    const msgSubRef = useRef<{ unsubscribe: () => void } | null>(null);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const forgetId = useCallback((id: string) => {
        try {
            api_base.api?.send({ forget: id });
        } catch {}
    }, []);

    const forgetAllProposals = useCallback(() => {
        proposalSubIdsRef.current.forEach(forgetId);
        proposalSubIdsRef.current = [];
    }, [forgetId]);

    // ── Symbol list ───────────────────────────────────────────────────────────
    useEffect(() => {
        const load = () => {
            const syms = api_base.active_symbols as {
                symbol: string;
                display_name?: string;
                market?: string;
            }[];
            if (syms?.length) {
                const filtered = syms
                    .filter(
                        s =>
                            s.market === 'synthetic_index' ||
                            s.symbol?.startsWith('1HZ') ||
                            s.symbol?.startsWith('R_')
                    )
                    .map(s => ({ value: s.symbol, label: s.display_name || s.symbol }));
                if (filtered.length) setAvailableSymbols(filtered);
            }
            if (api_base.is_authorized) setApiReady(true);
        };
        load();
        const t = setInterval(load, 2000);
        return () => clearInterval(t);
    }, []);

    // ── Master message listener ───────────────────────────────────────────────
    // Recreated when symbol changes so tick-filter captures the current symbol.
    useEffect(() => {
        if (!api_base.api) return;

        if (msgSubRef.current) {
            try { msgSubRef.current.unsubscribe(); } catch {}
        }

        const sub = api_base.api.onMessage().subscribe(({ data }: { data: any }) => {
            // ── Tick ──────────────────────────────────────────────────────────
            if (data.msg_type === 'tick' && data.tick?.symbol === symbol) {
                // Capture server-assigned subscription ID on first message so we
                // can `forget` only this stream when the symbol changes.
                if (data.subscription?.id && !tickSubIdRef.current) {
                    tickSubIdRef.current = data.subscription.id;
                }
                const quote: string = data.tick.quote?.toString() ?? '';
                setCurrentPrice(quote);
                setTickCount(c => c + 1);
                const lastDigit = parseInt(quote.slice(-1), 10);
                if (!isNaN(lastDigit)) {
                    setDigitHistory(prev => [...prev.slice(-19), lastDigit]);
                }
            }

            // ── Proposal ──────────────────────────────────────────────────────
            if (data.msg_type === 'proposal') {
                // Track proposal subscription IDs for targeted cleanup
                if (data.subscription?.id && !proposalSubIdsRef.current.includes(data.subscription.id)) {
                    proposalSubIdsRef.current.push(data.subscription.id);
                }

                // Discard stale proposals from a previous param set
                const session: number = data.proposal?.passthrough?.dtSess ?? data.echo_req?.passthrough?.dtSess;
                if (session !== proposalSessionRef.current) return;

                if (!data.proposal?.contract_type) return;
                const p = data.proposal;

                if (p.error) {
                    // Surface error without blocking the other direction
                    setProposals(prev => ({ ...prev, [p.contract_type]: null }));
                    setProposalsLoading(false);
                    return;
                }

                setProposals(prev => ({
                    ...prev,
                    [p.contract_type]: {
                        id: p.id,
                        price: parseFloat(p.ask_price ?? 0).toFixed(2),
                        payout: parseFloat(p.payout ?? 0).toFixed(2),
                    },
                }));
                setProposalsLoading(false);
            }

            // ── Proposal Open Contract (settlement) ───────────────────────────
            if (
                data.msg_type === 'proposal_open_contract' &&
                data.proposal_open_contract?.is_sold
            ) {
                const poc = data.proposal_open_contract;
                // Only handle the contract we initiated from this panel
                if (poc.contract_id !== activeContractIdRef.current) return;
                activeContractIdRef.current = null;

                const profit = parseFloat(poc.profit ?? 0);
                const isWin = profit > 0;
                setIsTrading(false);
                setStatusType(isWin ? 'win' : 'loss');
                setStatus(
                    isWin
                        ? `✓ Won $${Math.abs(profit).toFixed(2)}`
                        : `✗ Lost $${Math.abs(profit).toFixed(2)}`
                );

                // Push settled result to transactions panel
                if (transactions?.onBotContractEvent && poc.contract_id) {
                    try {
                        transactions.onBotContractEvent({
                            contract_id: poc.contract_id,
                            transaction_ids: { buy: poc.transaction_ids?.buy },
                            buy_price: poc.buy_price ?? 0,
                            sell_price: poc.sell_price ?? 0,
                            profit,
                            currency:
                                poc.currency ||
                                (api_base.account_info as any)?.currency ||
                                (client as any)?.currency ||
                                'USD',
                            contract_type: poc.contract_type || 'CALL',
                            underlying: poc.underlying || symbol,
                            display_name: poc.display_name || symbol,
                            date_start: poc.date_start || Math.floor(Date.now() / 1000),
                            status: 'sold',
                            is_sold: true,
                        });
                    } catch {}
                }
            }
        });

        msgSubRef.current = sub;
        return () => {
            try { sub.unsubscribe(); } catch {}
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol]);

    // ── Tick subscription ─────────────────────────────────────────────────────
    // Forget the previous server-side tick stream by its ID (not forget_all:
    // 'ticks', which would kill every tick subscriber on the shared WS).
    useEffect(() => {
        if (!api_base.api) return;

        if (tickSubIdRef.current) {
            forgetId(tickSubIdRef.current);
            tickSubIdRef.current = null;
        }
        setCurrentPrice('—');
        setDigitHistory([]);
        setTickCount(0);

        api_base.api.send({ ticks: symbol, subscribe: 1 });

        // Cleanup: forget the tick stream when the component unmounts or symbol
        // changes (the new-symbol effect will re-run before the forget lands,
        // but we clean up the latest ID in the unmount via ref).
        return () => {
            if (tickSubIdRef.current) {
                forgetId(tickSubIdRef.current);
                tickSubIdRef.current = null;
            }
        };
    }, [symbol, forgetId]);

    // ── Proposal refresh ──────────────────────────────────────────────────────
    const refreshProposals = useCallback(() => {
        if (!api_base.api || !api_base.is_authorized) {
            setProposalsLoading(false);
            return;
        }

        // Bump session so in-flight proposal responses from the old param set
        // are discarded on arrival.
        proposalSessionRef.current += 1;
        const currentSession = proposalSessionRef.current;

        forgetAllProposals();
        setProposals({});
        setProposalsLoading(true);

        const cat = CATEGORIES[category];
        const currency = (api_base.account_info as any)?.currency || 'USD';

        cat.types.forEach(contract_type => {
            const req: Record<string, unknown> = {
                proposal: 1,
                subscribe: 1,
                contract_type,
                currency,
                symbol,
                amount: stake,
                basis: 'stake',
                duration,
                duration_unit: durationUnit,
                passthrough: { dtSess: currentSession },
            };
            if (cat.needsBarrier) req.barrier = barrier.toString();
            api_base.api?.send(req);
        });
    }, [symbol, category, duration, durationUnit, stake, barrier, forgetAllProposals]);

    // Debounce so rapid input changes don't flood the API
    useEffect(() => {
        const t = setTimeout(refreshProposals, 600);
        return () => clearTimeout(t);
    }, [refreshProposals]);

    // ── Unmount cleanup ───────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (msgSubRef.current) {
                try { msgSubRef.current.unsubscribe(); } catch {}
            }
            if (tickSubIdRef.current) forgetId(tickSubIdRef.current);
            forgetAllProposals();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Place trade ───────────────────────────────────────────────────────────
    const placeTrade = useCallback(
        async (contractType: string) => {
            if (isTrading) return;
            if (!api_base.api || !api_base.is_authorized) {
                setStatus('Not connected — please log in first');
                setStatusType('default');
                return;
            }

            const proposal = proposals[contractType];
            if (!proposal?.id) {
                setStatus('Price not ready — please wait a moment');
                setStatusType('default');
                return;
            }

            setIsTrading(true);
            setStatusType('default');
            setStatus('Sending trade…');

            // Open the transaction drawer
            try {
                if (run_panel) {
                    if (!(run_panel as any).run_id) {
                        (run_panel as any).run_id = `dtrader-${Date.now()}`;
                    }
                    run_panel.setIsRunning(true);
                    run_panel.setContractStage(contract_stages.STARTING);
                    if (!run_panel.is_drawer_open) run_panel.toggleDrawer(true);
                    run_panel.setActiveTabIndex(1);
                }
            } catch {}

            try {
                const response: any = await (api_base.api as any).send({
                    buy: proposal.id,
                    price: parseFloat(proposal.price),
                });

                if (response?.error) {
                    setStatus(`Error: ${response.error.message}`);
                    setIsTrading(false);
                    setStatusType('default');
                    return;
                }

                const buy = response?.buy;
                if (!buy?.contract_id) {
                    // Unexpected response shape — don't leave isTrading stuck
                    setStatus('Unexpected response from server');
                    setIsTrading(false);
                    setStatusType('default');
                    return;
                }

                // Record which contract to listen for in the POC handler
                activeContractIdRef.current = buy.contract_id;
                setStatus(`Open — Contract #${buy.contract_id}`);

                // Subscribe to contract settlement
                api_base.api.send({
                    proposal_open_contract: 1,
                    contract_id: buy.contract_id,
                    subscribe: 1,
                });

                // Add opening entry to transactions panel immediately
                if (transactions?.onBotContractEvent) {
                    try {
                        transactions.onBotContractEvent({
                            contract_id: buy.contract_id,
                            transaction_ids: { buy: buy.transaction_id },
                            buy_price: buy.buy_price ?? parseFloat(proposal.price),
                            currency:
                                (api_base.account_info as any)?.currency ||
                                (client as any)?.currency ||
                                'USD',
                            contract_type: contractType,
                            underlying: symbol,
                            display_name:
                                availableSymbols.find(s => s.value === symbol)?.label || symbol,
                            date_start: Math.floor(Date.now() / 1000),
                            status: 'open',
                        });
                    } catch {}
                }
            } catch (err: any) {
                setStatus(`Error: ${err?.message || 'Unknown error'}`);
                setIsTrading(false);
                setStatusType('default');
            }
        },
        [isTrading, proposals, symbol, availableSymbols, transactions, run_panel, client]
    );

    // ─── Render ───────────────────────────────────────────────────────────────
    const cat = CATEGORIES[category];
    const currency = (api_base.account_info as any)?.currency || 'USD';
    const symbolLabel = availableSymbols.find(s => s.value === symbol)?.label || symbol;

    return (
        <div className='dtrader-native'>
            <div className='dtrader-native__layout'>
                {/* ── Left: Trade Controls ───────────────────────────────── */}
                <div className='dtrader-native__panel'>
                    <div className='dtrader-native__header'>
                        <span className='dtrader-native__logo'>DTrader</span>
                        <span className='dtrader-native__tag'>
                            {apiReady ? 'LIVE' : 'CONNECTING…'}
                        </span>
                    </div>

                    {/* Market */}
                    <div className='dtrader-native__field'>
                        <span className='dtrader-native__label'>Market</span>
                        <select
                            className='dtrader-native__select'
                            value={symbol}
                            onChange={e => setSymbol(e.target.value)}
                            disabled={isTrading}
                        >
                            {availableSymbols.length === 0 && (
                                <option value='1HZ100V'>Volatility 100 (1s) Index</option>
                            )}
                            {availableSymbols.map(s => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Trade Type */}
                    <div className='dtrader-native__field'>
                        <span className='dtrader-native__label'>Trade Type</span>
                        <select
                            className='dtrader-native__select'
                            value={category}
                            onChange={e => setCategory(e.target.value as CategoryKey)}
                            disabled={isTrading}
                        >
                            {(Object.keys(CATEGORIES) as CategoryKey[]).map(k => (
                                <option key={k} value={k}>
                                    {CATEGORIES[k].label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Barrier — digit contracts only */}
                    {cat.needsBarrier && (
                        <div className='dtrader-native__field'>
                            <span className='dtrader-native__label'>Digit (0 – 9)</span>
                            <input
                                className='dtrader-native__input'
                                type='number'
                                min={0}
                                max={9}
                                value={barrier}
                                onChange={e =>
                                    setBarrier(
                                        Math.min(9, Math.max(0, parseInt(e.target.value, 10) || 0))
                                    )
                                }
                                disabled={isTrading}
                            />
                        </div>
                    )}

                    {/* Duration */}
                    <div className='dtrader-native__field'>
                        <span className='dtrader-native__label'>Duration</span>
                        <div className='dtrader-native__duration-row'>
                            <input
                                className='dtrader-native__input dtrader-native__input--duration'
                                type='number'
                                min={1}
                                max={365}
                                value={duration}
                                onChange={e =>
                                    setDuration(Math.max(1, parseInt(e.target.value, 10) || 1))
                                }
                                disabled={isTrading}
                            />
                            <select
                                className='dtrader-native__select dtrader-native__select--unit'
                                value={durationUnit}
                                onChange={e => setDurationUnit(e.target.value)}
                                disabled={isTrading}
                            >
                                <option value='t'>Ticks</option>
                                <option value='s'>Seconds</option>
                                <option value='m'>Minutes</option>
                                <option value='h'>Hours</option>
                                <option value='d'>Days</option>
                            </select>
                        </div>
                    </div>

                    {/* Stake */}
                    <div className='dtrader-native__field'>
                        <span className='dtrader-native__label'>Stake ({currency})</span>
                        <input
                            className='dtrader-native__input'
                            type='number'
                            min={0.35}
                            step={0.5}
                            value={stake}
                            onChange={e =>
                                setStake(Math.max(0.35, parseFloat(e.target.value) || 1))
                            }
                            disabled={isTrading}
                        />
                    </div>

                    {/* Live tick box */}
                    <div className='dtrader-native__tick-box'>
                        <div className='dtrader-native__tick-label'>Live Price</div>
                        <div className='dtrader-native__tick-value'>{currentPrice}</div>
                        <div className='dtrader-native__digits'>
                            {digitHistory.slice(-10).map((d, i) => (
                                <div key={i} className='dtrader-native__digit'>
                                    {d}
                                </div>
                            ))}
                        </div>
                        <div className='dtrader-native__tick-count'>
                            {tickCount} tick{tickCount !== 1 ? 's' : ''} received
                        </div>
                    </div>

                    {/* Proposal prices */}
                    <div className='dtrader-native__proposals'>
                        {proposalsLoading && cat.types.some(t => !proposals[t]) && (
                            <div className='dtrader-native__proposal-loading'>
                                Fetching prices…
                            </div>
                        )}
                        {cat.types.map(contractType => {
                            const p = proposals[contractType];
                            const meta = TYPE_LABELS[contractType];
                            return (
                                <div
                                    key={contractType}
                                    className={`dtrader-native__proposal dtrader-native__proposal--${meta.side}`}
                                >
                                    <span>
                                        {meta.label} {meta.arrow}
                                    </span>
                                    <strong>{p ? `$${p.price}` : '—'}</strong>
                                    {p && <small>Payout ${p.payout}</small>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Buy buttons */}
                    <div className='dtrader-native__buy-row'>
                        {cat.types.map(contractType => {
                            const p = proposals[contractType];
                            const meta = TYPE_LABELS[contractType];
                            return (
                                <button
                                    key={contractType}
                                    className={`dtrader-native__buy-btn dtrader-native__buy-btn--${meta.side}`}
                                    disabled={isTrading || !p?.id}
                                    onClick={() => placeTrade(contractType)}
                                >
                                    <span className='dtrader-native__btn-arrow'>
                                        {meta.arrow}
                                    </span>
                                    {meta.label}
                                    {p && <small>${p.price}</small>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Status */}
                    {isTrading && (
                        <div className='dtrader-native__running'>
                            <div className='dtrader-native__spinner' />
                            <span>Trade in progress…</span>
                        </div>
                    )}
                    {!isTrading && status && (
                        <div
                            className={[
                                'dtrader-native__status',
                                statusType !== 'default'
                                    ? `dtrader-native__status--${statusType}`
                                    : '',
                            ]
                                .join(' ')
                                .trim()}
                        >
                            {status}
                        </div>
                    )}
                </div>

                {/* ── Right: Live Feed ───────────────────────────────────── */}
                <div className='dtrader-native__feed'>
                    <div className='dtrader-native__feed-header'>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className='dtrader-native__live-dot' />
                            <span>{symbolLabel}</span>
                        </div>
                        <span style={{ color: '#58a6ff' }}>{cat.label}</span>
                    </div>

                    {/* Big live price */}
                    <div className='dtrader-native__feed-price'>{currentPrice}</div>

                    {/* Last 20 digits, colour-coded even / odd */}
                    <div className='dtrader-native__digit-row'>
                        {digitHistory.map((d, i) => (
                            <div
                                key={i}
                                className={`dtrader-native__feed-digit dtrader-native__feed-digit--${
                                    d % 2 === 0 ? 'even' : 'odd'
                                }`}
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Info grid */}
                    <div className='dtrader-native__info-grid'>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Symbol</div>
                            <div className='dtrader-native__info-value'>{symbol}</div>
                        </div>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Currency</div>
                            <div className='dtrader-native__info-value'>{currency}</div>
                        </div>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Duration</div>
                            <div className='dtrader-native__info-value'>
                                {duration}&nbsp;{durationUnit}
                            </div>
                        </div>
                        <div className='dtrader-native__info-card'>
                            <div className='dtrader-native__info-label'>Stake</div>
                            <div className='dtrader-native__info-value'>${stake}</div>
                        </div>
                        <div
                            className='dtrader-native__info-card'
                            style={{ gridColumn: '1 / -1' }}
                        >
                            <div className='dtrader-native__info-label'>Status</div>
                            <div
                                className={`dtrader-native__info-value${
                                    statusType !== 'default'
                                        ? ' dtrader-native__info-value--active'
                                        : ''
                                }`}
                            >
                                {isTrading ? '⏳ Trade running…' : status || 'Ready to trade'}
                            </div>
                        </div>
                    </div>

                    {/* Result card after settlement */}
                    {!isTrading && statusType === 'win' && (
                        <div className='dtrader-native__result dtrader-native__result--win'>
                            <div>Win</div>
                            <div className='dtrader-native__result-amount'>{status}</div>
                        </div>
                    )}
                    {!isTrading && statusType === 'loss' && (
                        <div className='dtrader-native__result dtrader-native__result--loss'>
                            <div>Loss</div>
                            <div className='dtrader-native__result-amount'>{status}</div>
                        </div>
                    )}

                    {!apiReady && (
                        <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '1rem' }}>
                            ⏳ Connecting to Deriv API… Log in if you haven't already.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default Dtrader;
