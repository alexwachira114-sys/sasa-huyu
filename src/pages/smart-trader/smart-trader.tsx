import React, { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId, getSocketURL } from '@/components/shared';
import './smart-trader.scss';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SymbolSignal {
    symbol: string;
    label: string;
    ticks: number[];
    rise255: number;
    fall255: number;
    rise55: number;
    fall55: number;
    digitCounts: number[];
    totalTicks: number;
}

interface RiseFallRow {
    symbol: string;
    label: string;
    rise255: number;
    fall255: number;
    rise55: number;
    fall55: number;
    signal: 'buy' | 'sell' | 'neutral';
}

interface OverUnderRow {
    symbol: string;
    label: string;
    digitPcts: number[];
    overSignal: boolean;
    underSignal: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STANDARD_SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];

function symbolLabel(symbol: string): string {
    const map: Record<string, string> = {
        R_10: 'Vol 10',
        R_25: 'Vol 25',
        R_50: 'Vol 50',
        R_75: 'Vol 75',
        R_100: 'Vol 100',
        '1HZ10V': 'Vol 10 (1s)',
        '1HZ25V': 'Vol 25 (1s)',
        '1HZ50V': 'Vol 50 (1s)',
        '1HZ75V': 'Vol 75 (1s)',
        '1HZ100V': 'Vol 100 (1s)',
        '1HZ150V': 'Vol 150 (1s)',
        '1HZ200V': 'Vol 200 (1s)',
        '1HZ250V': 'Vol 250 (1s)',
        '1HZ300V': 'Vol 300 (1s)',
    };
    return map[symbol] ?? symbol;
}

function calcTrend(ticks: number[], count: number) {
    const slice = ticks.slice(-count);
    if (slice.length < 2) return { rise: 0, fall: 0 };
    let rise = 0;
    let fall = 0;
    for (let i = 1; i < slice.length; i++) {
        if (slice[i] > slice[i - 1]) rise++;
        else if (slice[i] < slice[i - 1]) fall++;
    }
    const total = rise + fall || 1;
    return { rise: (rise / total) * 100, fall: (fall / total) * 100 };
}

function calcDigits(ticks: number[]) {
    const counts = new Array(10).fill(0);
    ticks.forEach(t => {
        const str = t.toFixed(4);
        const d = parseInt(str[str.length - 1]);
        if (!isNaN(d)) counts[d]++;
    });
    return counts;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const SignalBadge: React.FC<{ type: 'buy' | 'sell' | 'over' | 'under' | 'neutral'; label: string }> = ({
    type,
    label,
}) => <span className={`st-badge st-badge--${type}`}>{label}</span>;

const ConnectionDot: React.FC<{ status: 'connecting' | 'connected' | 'error' }> = ({ status }) => (
    <span className={`st-dot st-dot--${status}`} title={status} />
);

// ─── Signals Scanner (native) ─────────────────────────────────────────────────
const SignalsScanner: React.FC = () => {
    const [rows, setRows] = useState<RiseFallRow[]>([]);
    const [ouRows, setOuRows] = useState<OverUnderRow[]>([]);
    const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const storageRef = useRef<Record<string, SymbolSignal>>({});
    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const recompute = useCallback(() => {
        const store = storageRef.current;
        const rf: RiseFallRow[] = [];
        const ou: OverUnderRow[] = [];

        Object.values(store).forEach(s => {
            if (s.ticks.length < 55) return;

            const t255 = calcTrend(s.ticks, 255);
            const t55 = calcTrend(s.ticks, 55);
            const isBuy = t255.rise > 57 && t55.rise > 55;
            const isSell = t255.fall > 57 && t55.fall > 55;

            rf.push({
                symbol: s.symbol,
                label: s.label,
                rise255: t255.rise,
                fall255: t255.fall,
                rise55: t55.rise,
                fall55: t55.fall,
                signal: isBuy ? 'buy' : isSell ? 'sell' : 'neutral',
            });

            const dc = calcDigits(s.ticks);
            const total = s.ticks.length || 1;
            const pcts = dc.map(c => (c / total) * 100);
            const over = pcts[7] < 10 && pcts[8] < 10 && pcts[9] < 10;
            const under = pcts[0] < 10 && pcts[1] < 10 && pcts[2] < 10;
            ou.push({
                symbol: s.symbol,
                label: s.label,
                digitPcts: pcts,
                overSignal: over,
                underSignal: under,
            });
        });

        // Sort: signals first, then by label
        rf.sort((a, b) => {
            const rank = (x: RiseFallRow) => (x.signal !== 'neutral' ? 0 : 1);
            return rank(a) - rank(b) || a.label.localeCompare(b.label);
        });
        ou.sort((a, b) => {
            const rank = (x: OverUnderRow) => (x.overSignal || x.underSignal ? 0 : 1);
            return rank(a) - rank(b) || a.label.localeCompare(b.label);
        });

        setRows(rf);
        setOuRows(ou);
        setLastUpdated(new Date());
    }, []);

    useEffect(() => {
        const url = `wss://${getSocketURL()}/websockets/v3?app_id=${getAppId()}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;
        setWsStatus('connecting');

        const subscribe = (symbol: string) => {
            ws.send(
                JSON.stringify({
                    ticks_history: symbol,
                    count: 255,
                    end: 'latest',
                    style: 'ticks',
                    subscribe: 1,
                })
            );
        };

        ws.onopen = () => {
            setWsStatus('connected');
            ws.send(JSON.stringify({ active_symbols: 'brief' }));
            STANDARD_SYMBOLS.forEach(sym => {
                if (!storageRef.current[sym]) {
                    storageRef.current[sym] = {
                        symbol: sym,
                        label: symbolLabel(sym),
                        ticks: [],
                        rise255: 0,
                        fall255: 0,
                        rise55: 0,
                        fall55: 0,
                        digitCounts: new Array(10).fill(0),
                        totalTicks: 0,
                    };
                }
                subscribe(sym);
            });
        };

        ws.onmessage = e => {
            const data = JSON.parse(e.data);
            if (data.error) return;

            if (data.active_symbols) {
                const oneSecond = (data.active_symbols as any[]).filter(
                    s => s.display_name?.includes('(1s)') || s.display_name?.includes('1 second')
                );
                oneSecond.forEach((s: any) => {
                    if (!storageRef.current[s.symbol]) {
                        storageRef.current[s.symbol] = {
                            symbol: s.symbol,
                            label: symbolLabel(s.symbol),
                            ticks: [],
                            rise255: 0,
                            fall255: 0,
                            rise55: 0,
                            fall55: 0,
                            digitCounts: new Array(10).fill(0),
                            totalTicks: 0,
                        };
                        subscribe(s.symbol);
                    }
                });
                return;
            }

            if (data.history?.prices) {
                const sym = data.echo_req?.ticks_history;
                if (sym && storageRef.current[sym]) {
                    storageRef.current[sym].ticks = data.history.prices.map((p: string) => parseFloat(p));
                }
            } else if (data.tick) {
                const sym = data.tick.symbol;
                if (sym && storageRef.current[sym]) {
                    storageRef.current[sym].ticks.push(parseFloat(data.tick.quote));
                    if (storageRef.current[sym].ticks.length > 300) storageRef.current[sym].ticks.shift();
                }
            }
        };

        ws.onerror = () => setWsStatus('error');
        ws.onclose = () => {
            if (wsStatus !== 'error') setWsStatus('error');
        };

        timerRef.current = setInterval(recompute, 1500);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            ws.close();
        };
    }, []);

    const hasData = rows.length > 0;
    const activeBuy = rows.filter(r => r.signal === 'buy').length;
    const activeSell = rows.filter(r => r.signal === 'sell').length;
    const activeOu = ouRows.filter(r => r.overSignal || r.underSignal).length;

    return (
        <div className='st-scanner'>
            {/* Status bar */}
            <div className='st-scanner__status-bar'>
                <div className='st-scanner__status-left'>
                    <ConnectionDot status={wsStatus} />
                    <span className='st-scanner__status-label'>
                        {wsStatus === 'connected' ? 'Live' : wsStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
                    </span>
                    {lastUpdated && (
                        <span className='st-scanner__updated'>
                            Updated {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                </div>
                <div className='st-scanner__status-right'>
                    <span className='st-scanner__stat st-scanner__stat--buy'>{activeBuy} Buy</span>
                    <span className='st-scanner__stat st-scanner__stat--sell'>{activeSell} Sell</span>
                    <span className='st-scanner__stat st-scanner__stat--ou'>{activeOu} Digit</span>
                </div>
            </div>

            {!hasData && (
                <div className='st-scanner__loading'>
                    <div className='st-spinner' />
                    <p>Collecting tick data… signals appear after 55+ ticks per market.</p>
                </div>
            )}

            {hasData && (
                <div className='st-scanner__grid'>
                    {/* Rise / Fall */}
                    <div className='st-table-card'>
                        <h3 className='st-table-card__title'>📈 Rise / Fall Signals</h3>
                        <table className='st-table'>
                            <thead>
                                <tr>
                                    <th>Market</th>
                                    <th>255-tick trend</th>
                                    <th>55-tick trend</th>
                                    <th>Signal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr
                                        key={r.symbol}
                                        className={
                                            r.signal !== 'neutral' ? `st-table__row--${r.signal}` : ''
                                        }
                                    >
                                        <td className='st-table__market'>{r.label}</td>
                                        <td>
                                            <span className='st-pct st-pct--rise'>
                                                ↑ {r.rise255.toFixed(0)}%
                                            </span>
                                            {' / '}
                                            <span className='st-pct st-pct--fall'>
                                                ↓ {r.fall255.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td>
                                            <span className='st-pct st-pct--rise'>
                                                ↑ {r.rise55.toFixed(0)}%
                                            </span>
                                            {' / '}
                                            <span className='st-pct st-pct--fall'>
                                                ↓ {r.fall55.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td>
                                            {r.signal === 'buy' ? (
                                                <SignalBadge type='buy' label='BUY ↑' />
                                            ) : r.signal === 'sell' ? (
                                                <SignalBadge type='sell' label='SELL ↓' />
                                            ) : (
                                                <SignalBadge type='neutral' label='——' />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Over / Under */}
                    <div className='st-table-card'>
                        <h3 className='st-table-card__title'>🎲 Digit — Over 2 / Under 7</h3>
                        <table className='st-table'>
                            <thead>
                                <tr>
                                    <th>Market</th>
                                    <th>Low digits (0-2)</th>
                                    <th>High digits (7-9)</th>
                                    <th>Signal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ouRows.map(r => {
                                    const lowAvg = ((r.digitPcts[0] + r.digitPcts[1] + r.digitPcts[2]) / 3).toFixed(1);
                                    const highAvg = ((r.digitPcts[7] + r.digitPcts[8] + r.digitPcts[9]) / 3).toFixed(1);
                                    const hasSignal = r.overSignal || r.underSignal;
                                    return (
                                        <tr
                                            key={r.symbol}
                                            className={hasSignal ? 'st-table__row--digit' : ''}
                                        >
                                            <td className='st-table__market'>{r.label}</td>
                                            <td>
                                                <span className='st-pct st-pct--under'>{lowAvg}% avg</span>
                                            </td>
                                            <td>
                                                <span className='st-pct st-pct--over'>{highAvg}% avg</span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {r.overSignal ? (
                                                        <SignalBadge type='over' label='Over 2' />
                                                    ) : null}
                                                    {r.underSignal ? (
                                                        <SignalBadge type='under' label='Under 7' />
                                                    ) : null}
                                                    {!r.overSignal && !r.underSignal ? (
                                                        <SignalBadge type='neutral' label='——' />
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Risk Calculator (React-state based) ──────────────────────────────────────
const RiskCalculator: React.FC = () => {
    const [capital, setCapital] = useState<string>('');

    const cap = parseFloat(capital) || 0;
    const stake = (cap * 0.02).toFixed(2);
    const takeProfit = (cap * 0.02 * 5).toFixed(2);
    let stopLoss = 0;
    let cur = cap * 0.02;
    for (let i = 0; i < 4; i++) {
        stopLoss += cur;
        cur *= 2;
    }

    return (
        <div className='st-calc'>
            <div className='st-calc__card'>
                <h2 className='st-calc__title'>Martingale Risk Calculator</h2>
                <p className='st-calc__desc'>
                    Enter your total capital to calculate recommended stake, take-profit and stop-loss using
                    Martingale risk rules.
                </p>

                <div className='st-calc__field'>
                    <label className='st-calc__label' htmlFor='st-capital'>
                        Initial Capital (USD)
                    </label>
                    <input
                        id='st-capital'
                        className='st-calc__input'
                        type='number'
                        min='0'
                        step='0.01'
                        placeholder='e.g. 500'
                        value={capital}
                        onChange={e => setCapital(e.target.value)}
                    />
                </div>

                <div className='st-calc__results'>
                    <div className='st-calc__result-item st-calc__result-item--stake'>
                        <span className='st-calc__result-label'>Stake (2% of capital)</span>
                        <span className='st-calc__result-value'>${stake}</span>
                    </div>
                    <div className='st-calc__result-item st-calc__result-item--tp'>
                        <span className='st-calc__result-label'>Take Profit (5× stake)</span>
                        <span className='st-calc__result-value'>${takeProfit}</span>
                    </div>
                    <div className='st-calc__result-item st-calc__result-item--sl'>
                        <span className='st-calc__result-label'>Stop Loss (4 Martingale losses)</span>
                        <span className='st-calc__result-value'>${stopLoss.toFixed(2)}</span>
                    </div>
                </div>

                {cap > 0 && (
                    <div className='st-calc__sequence'>
                        <p className='st-calc__seq-title'>Martingale stake sequence:</p>
                        <div className='st-calc__seq-row'>
                            {Array.from({ length: 4 }, (_, i) => {
                                const s = (cap * 0.02 * Math.pow(2, i)).toFixed(2);
                                return (
                                    <span key={i} className='st-calc__seq-pill'>
                                        L{i + 1}: ${s}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const MODES = [
    { value: 'signals', label: '📡 Live Signals' },
    { value: 'risk-calculator', label: '🧮 Risk Calculator' },
];

const SmartTrader = observer(() => {
    const [mode, setMode] = useState<string>('signals');

    return (
        <div className='smart-trader'>
            <div className='smart-trader__container'>
                {/* Top bar */}
                <div className='smart-trader__topbar'>
                    <div className='smart-trader__mode-selector'>
                        <div className='smart-trader__mode-dropdown-container'>
                            <select
                                value={mode}
                                onChange={e => setMode(e.target.value)}
                                className='smart-trader__mode-dropdown'
                            >
                                {MODES.map(m => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                            <div className='smart-trader__dropdown-indicator'>
                                <svg width='12' height='12' viewBox='0 0 24 24' fill='none'>
                                    <path d='M7 10L12 15L17 10H7Z' fill='currentColor' />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className='smart-trader__content'>
                    {mode === 'signals' && <SignalsScanner />}
                    {mode === 'risk-calculator' && <RiskCalculator />}
                </div>
            </div>
        </div>
    );
});

export default SmartTrader;
