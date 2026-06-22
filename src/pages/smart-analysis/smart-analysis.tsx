import { useEffect, useMemo, useRef, useState } from 'react';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import './smart-analysis.scss';

const SYMBOLS = [
    { label: 'Volatility 100 Index', value: 'R_100' },
    { label: 'Volatility 100 (1s) Index', value: '1HZ100V' },
    { label: 'Volatility 10 (1s) Index', value: '1HZ10V' },
    { label: 'Volatility 10 Index', value: 'R_10' },
    { label: 'Volatility 50 Index', value: 'R_50' },
    { label: 'Volatility 25 (1s) Index', value: '1HZ25V' },
    { label: 'Volatility 75 (1s) Index', value: '1HZ75V' },
    { label: 'Volatility 75 Index', value: 'R_75' },
    { label: 'Volatility 50 (1s) Index', value: '1HZ50V' },
    { label: 'Volatility 25 Index', value: 'R_25' },
];

const COMPARISON_TYPES = [
    { label: 'Even vs. Odd', value: 'evenodd' },
    { label: 'Rise vs. Fall', value: 'risefall' },
    { label: 'Over 4 vs. Under 5', value: 'overunder' },
    { label: 'Matches vs. Differs', value: 'matchdiff' },
];

const WINDOW_SIZES = [25, 60, 120, 240, 1000];

type TickEntry = {
    digit: number;
    price: string;
    epoch: number;
    direction: 'rise' | 'fall' | null;
};

type SignalType = 'over4' | 'under5' | 'even' | 'odd' | 'rise' | 'fall' | null;

type MarketStats = {
    symbol: string;
    label: string;
    currentPrice: string;
    ticks: TickEntry[];
    isConnected: boolean;
};

// ── Shared market data hook (all markets at once) ─────────────────────────────
const useAllMarkets = () => {
    const [markets, setMarkets] = useState<Record<string, MarketStats>>(() =>
        Object.fromEntries(
            SYMBOLS.map(s => [
                s.value,
                { symbol: s.value, label: s.label, currentPrice: '—', ticks: [], isConnected: false },
            ])
        )
    );

    const apisRef = useRef<Record<string, any>>({});
    const subsRef = useRef<Record<string, any>>({});

    useEffect(() => {
        let mounted = true;

        const parseTick = (quote: number, pip: number, epoch: number, prev: number | null): TickEntry => {
            const priceStr = quote.toFixed(pip);
            const digit = parseInt(priceStr[priceStr.length - 1]);
            return { digit, price: priceStr, epoch, direction: prev === null ? null : quote > prev ? 'rise' : 'fall' };
        };

        const connectSymbol = async (sym: string) => {
            const prevPriceRef = { current: null as number | null };
            try {
                const api = generateDerivApiInstance() as any;
                apisRef.current[sym] = api;
                await new Promise<void>(resolve => {
                    if (api.connection.readyState === WebSocket.OPEN) resolve();
                    else api.connection.addEventListener('open', () => resolve(), { once: true });
                });
                if (!mounted) return;
                try {
                    const history = await api.send({ ticks_history: sym, count: 1200, end: 'latest', style: 'ticks' });
                    if (mounted && history?.history) {
                        const { prices, times } = history.history;
                        const pip = history.pip_size ?? 2;
                        const historical: TickEntry[] = [];
                        prices.forEach((q: number, i: number) =>
                            historical.push(parseTick(q, pip, times[i], i === 0 ? null : prices[i - 1]))
                        );
                        prevPriceRef.current = prices[prices.length - 1] ?? null;
                        setMarkets(prev => ({
                            ...prev,
                            [sym]: {
                                ...prev[sym],
                                ticks: historical,
                                currentPrice: historical[historical.length - 1]?.price ?? '—',
                                isConnected: true,
                            },
                        }));
                    }
                } catch (_e) {}
                if (!mounted) return;
                const stream = api.subscribe({ ticks: sym, subscribe: 1 });
                subsRef.current[sym] = stream.subscribe({
                    next: (res: any) => {
                        if (!mounted || !res?.tick) return;
                        const { quote, pip_size, epoch } = res.tick;
                        const pip = pip_size ?? 2;
                        const entry = parseTick(quote as number, pip, epoch, prevPriceRef.current);
                        prevPriceRef.current = quote as number;
                        setMarkets(prev => ({
                            ...prev,
                            [sym]: {
                                ...prev[sym],
                                ticks: [...prev[sym].ticks, entry].slice(-2000),
                                currentPrice: entry.price,
                                isConnected: true,
                            },
                        }));
                    },
                    error: () => {
                        if (mounted) setMarkets(prev => ({ ...prev, [sym]: { ...prev[sym], isConnected: false } }));
                    },
                });
            } catch (_e) {}
        };

        SYMBOLS.forEach(s => connectSymbol(s.value));

        return () => {
            mounted = false;
            Object.values(subsRef.current).forEach(sub => sub?.unsubscribe?.());
            Object.values(apisRef.current).forEach(api => {
                try {
                    api?.disconnect?.();
                } catch (_e) {}
            });
        };
    }, []);

    return markets;
};

// ── Digit stats from tick slice ───────────────────────────────────────────────
const computeStats = (ticks: TickEntry[], sampleSize: number) => {
    const slice = ticks.slice(-sampleSize);
    const digits = slice.map(t => t.digit);
    const total = digits.length || 1;

    const counts = Array(10).fill(0);
    digits.forEach(d => counts[d]++);
    const dist = counts.map((count, digit) => ({ digit, count, pct: (count / total) * 100 }));
    const sorted = [...dist].sort((a, b) => b.pct - a.pct);

    const most = sorted[0];
    const secondMost = sorted[1];
    const least = sorted[sorted.length - 1];
    const secondLeast = sorted[sorted.length - 2];

    const evenCount = digits.filter(d => d % 2 === 0).length;
    const evenPct = (evenCount / total) * 100;
    const oddPct = 100 - evenPct;

    const directed = slice.filter(t => t.direction !== null);
    const riseCount = directed.filter(t => t.direction === 'rise').length;
    const risePct = (riseCount / (directed.length || 1)) * 100;
    const fallPct = 100 - risePct;

    const over4Count = digits.filter(d => d > 4).length;
    const over4Pct = (over4Count / total) * 100;
    const under5Count = digits.filter(d => d < 5).length;
    const under5Pct = (under5Count / total) * 100;

    return { dist, most, secondMost, least, secondLeast, evenPct, oddPct, risePct, fallPct, over4Pct, under5Pct, total };
};

// ── Signal detection ──────────────────────────────────────────────────────────
const detectSignal = (stats: ReturnType<typeof computeStats>): { type: SignalType; condition: string; values: string; confidence: number } => {
    const { most, secondMost, least, evenPct, oddPct, risePct, fallPct, over4Pct, under5Pct } = stats;

    if (over4Pct > 55 && most.digit >= 5 && secondMost.digit >= 5 && least.digit <= 4) {
        const conf = (over4Pct - 55) * 3.1 + (most.pct - 10) * 0.5;
        return {
            type: 'over4',
            condition: 'Over 4 should be above 55% and Most and 2nd most should be in 5–9 and Least should be in 0–4.',
            values: `Over 4%: ${over4Pct.toFixed(1)}%\nMost Appearing Digit: ${most.digit} (${most.pct.toFixed(1)}%)\n2nd Most Appearing Digit: ${secondMost.digit} (${secondMost.pct.toFixed(1)}%)\nLeast Appearing Digit: ${least.digit} (${least.pct.toFixed(1)}%)`,
            confidence: Math.min(conf, 99),
        };
    }
    if (under5Pct > 55 && most.digit <= 4 && secondMost.digit <= 4 && least.digit >= 5) {
        const conf = (under5Pct - 55) * 3.1 + (most.pct - 10) * 0.5;
        return {
            type: 'under5',
            condition: 'Under 5 should be above 55% and Most and 2nd most should be in 0–4 and Least should be in 5–9.',
            values: `Under 5%: ${under5Pct.toFixed(1)}%\nMost Appearing Digit: ${most.digit} (${most.pct.toFixed(1)}%)\n2nd Most Appearing Digit: ${secondMost.digit} (${secondMost.pct.toFixed(1)}%)\nLeast Appearing Digit: ${least.digit} (${least.pct.toFixed(1)}%)`,
            confidence: Math.min(conf, 99),
        };
    }
    if (evenPct > 55) {
        const conf = (evenPct - 55) * 3.5;
        return {
            type: 'even',
            condition: 'Even digits should appear more than 55% of the time.',
            values: `Even%: ${evenPct.toFixed(1)}%\nOdd%: ${oddPct.toFixed(1)}%\nMost Appearing Digit: ${most.digit} (${most.pct.toFixed(1)}%)`,
            confidence: Math.min(conf, 99),
        };
    }
    if (oddPct > 55) {
        const conf = (oddPct - 55) * 3.5;
        return {
            type: 'odd',
            condition: 'Odd digits should appear more than 55% of the time.',
            values: `Odd%: ${oddPct.toFixed(1)}%\nEven%: ${evenPct.toFixed(1)}%\nMost Appearing Digit: ${most.digit} (${most.pct.toFixed(1)}%)`,
            confidence: Math.min(conf, 99),
        };
    }
    if (risePct > 57) {
        const conf = (risePct - 57) * 4;
        return {
            type: 'rise',
            condition: 'Rise should be above 57% of ticks.',
            values: `Rise%: ${risePct.toFixed(1)}%\nFall%: ${fallPct.toFixed(1)}%`,
            confidence: Math.min(conf, 99),
        };
    }
    if (fallPct > 57) {
        const conf = (fallPct - 57) * 4;
        return {
            type: 'fall',
            condition: 'Fall should be above 57% of ticks.',
            values: `Fall%: ${fallPct.toFixed(1)}%\nRise%: ${risePct.toFixed(1)}%`,
            confidence: Math.min(conf, 99),
        };
    }
    return { type: null, condition: '', values: '', confidence: 0 };
};

const SIGNAL_LABELS: Record<string, string> = {
    over4: 'OVER 4 SIGNAL',
    under5: 'UNDER 5 SIGNAL',
    even: 'EVEN SIGNAL',
    odd: 'ODD SIGNAL',
    rise: 'RISE SIGNAL',
    fall: 'FALL SIGNAL',
};

const SIGNAL_COLORS: Record<string, string> = {
    over4: 'sa__badge--green',
    under5: 'sa__badge--blue',
    even: 'sa__badge--teal',
    odd: 'sa__badge--purple',
    rise: 'sa__badge--green',
    fall: 'sa__badge--red',
};

// ── Digit circle ──────────────────────────────────────────────────────────────
const DigitCircle = ({ digit, pct, color }: { digit: number; pct: number; color: 'green' | 'blue' | 'red' | 'yellow' }) => (
    <div className={`sa__digit-circle sa__digit-circle--${color}`}>
        <span className='sa__digit-circle-num'>{digit}</span>
        <span className='sa__digit-circle-pct'>{pct.toFixed(1)}%</span>
    </div>
);

// ── Split bar ─────────────────────────────────────────────────────────────────
const SplitBar = ({ leftLabel, leftPct, rightLabel, leftCount, rightCount }: {
    leftLabel: string; leftPct: number; rightLabel: string; leftCount: number; rightCount: number;
}) => (
    <div className='sa__split-bar-wrap'>
        <div className='sa__split-bar'>
            <div className='sa__split-bar-left' style={{ flex: Math.max(leftPct, 1) }}>
                <span className='sa__split-bar-pct'>{leftPct.toFixed(2)}%</span>
                <span className='sa__split-bar-count'>{leftLabel} Count: {leftCount}</span>
            </div>
            <div className='sa__split-bar-right' style={{ flex: Math.max(100 - leftPct, 1) }}>
                <span className='sa__split-bar-pct'>{(100 - leftPct).toFixed(2)}%</span>
                <span className='sa__split-bar-count'>{rightLabel} Count: {rightCount}</span>
            </div>
        </div>
    </div>
);

// ════════════════════════════════════════════════════════════════════════════
// TAB: Summary
// ════════════════════════════════════════════════════════════════════════════
const SummaryTab = ({ markets, sampleSize, onSampleSizeChange }: {
    markets: Record<string, MarketStats>;
    sampleSize: number;
    onSampleSizeChange: (n: number) => void;
}) => {
    const [summaryView, setSummaryView] = useState<'summary' | 'digits'>('summary');

    const allStats = useMemo(() =>
        SYMBOLS.map(s => {
            const m = markets[s.value];
            const stats = computeStats(m.ticks, sampleSize);
            const signal = detectSignal(stats);
            return { ...stats, symbol: s.value, label: s.label, currentPrice: m.currentPrice, signal };
        }),
        [markets, sampleSize]
    );

    const signals = allStats.filter(s => s.signal.type !== null).sort((a, b) => b.signal.confidence - a.signal.confidence);

    return (
        <div className='sa__summary'>
            {/* ── Signals ── */}
            {signals.length > 0 && (
                <div className='sa__signals-section'>
                    <h2 className='sa__signals-title'>Signals</h2>
                    <div className='sa__signals-table-wrap'>
                        <table className='sa__signals-table'>
                            <thead>
                                <tr>
                                    <th>RANK</th>
                                    <th>MARKET</th>
                                    <th>SIGNAL</th>
                                    <th>SIGNAL CONDITION (MET)</th>
                                    <th>ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {signals.map((s, i) => (
                                    <tr key={s.symbol} className='sa__signal-row'>
                                        <td className='sa__rank'>#{i + 1}</td>
                                        <td className='sa__market-name'>{s.label}</td>
                                        <td>
                                            <span className={`sa__badge ${SIGNAL_COLORS[s.signal.type!]}`}>
                                                {SIGNAL_LABELS[s.signal.type!]}
                                            </span>
                                        </td>
                                        <td className='sa__condition-cell'>
                                            <div className='sa__condition-block'>
                                                <p className='sa__cond-label'>Condition:</p>
                                                <p className='sa__cond-text'>{s.signal.condition}</p>
                                                <p className='sa__cond-label'>Values:</p>
                                                {s.signal.values.split('\n').map((v, vi) => (
                                                    <p key={vi} className='sa__cond-value'>{v}</p>
                                                ))}
                                                <p className='sa__cond-label'>Confidence:</p>
                                                <p className='sa__cond-value'>Signal Confidence: {s.signal.confidence.toFixed(1)}%</p>
                                            </div>
                                        </td>
                                        <td>
                                            <button className='sa__load-btn' onClick={() => {
                                                try {
                                                    const ws = (window as any)?.Blockly?.derivWorkspace;
                                                    if (ws) {
                                                        const evt = new CustomEvent('sa:load-signal', { detail: { symbol: s.symbol, signal: s.signal.type } });
                                                        window.dispatchEvent(evt);
                                                    }
                                                } catch (_e) {}
                                            }}>
                                                Load Signal
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {signals.length === 0 && (
                <div className='sa__no-signals'>
                    <span className='sa__no-signals-icon'>📊</span>
                    <p>Scanning markets for signals… (waiting for enough tick data)</p>
                </div>
            )}

            {/* ── Market Summary ── */}
            <div className='sa__market-summary'>
                <div className='sa__market-summary-header'>
                    <h3 className='sa__market-summary-title'>Market Summary (Last {sampleSize} Ticks)</h3>
                    <div className='sa__ticks-input-wrap'>
                        <label className='sa__ticks-label'>Ticks:</label>
                        <input
                            type='number'
                            className='sa__ticks-input'
                            value={sampleSize}
                            min={25}
                            max={2000}
                            onChange={e => {
                                const n = parseInt(e.target.value, 10);
                                if (!isNaN(n) && n >= 25 && n <= 2000) onSampleSizeChange(n);
                            }}
                        />
                    </div>
                </div>

                <div className='sa__view-toggle'>
                    <button
                        className={`sa__view-btn${summaryView === 'summary' ? ' sa__view-btn--active' : ''}`}
                        onClick={() => setSummaryView('summary')}
                    >
                        SUMMARY
                    </button>
                    <button
                        className={`sa__view-btn sa__view-btn--red${summaryView === 'digits' ? ' sa__view-btn--active-red' : ''}`}
                        onClick={() => setSummaryView('digits')}
                    >
                        DIGITS %
                    </button>
                </div>

                {summaryView === 'digits' && (
                    <div className='sa__legend'>
                        <span className='sa__legend-item sa__legend-item--green'>● Most Appearing</span>
                        <span className='sa__legend-item sa__legend-item--blue'>● 2nd Most</span>
                        <span className='sa__legend-item sa__legend-item--red'>● Least Appearing</span>
                        <span className='sa__legend-item sa__legend-item--yellow'>● 2nd Least</span>
                    </div>
                )}

                <div className='sa__mkt-table-wrap'>
                    <table className='sa__mkt-table'>
                        <thead>
                            <tr>
                                <th>MARKET</th>
                                <th>CURRENT PRICE</th>
                                {summaryView === 'digits' ? (
                                    <>
                                        <th>MOST</th>
                                        <th>2ND MOST</th>
                                        <th>LEAST</th>
                                        <th>2ND LEAST</th>
                                    </>
                                ) : (
                                    <>
                                        <th>MOST DIGIT</th>
                                        <th>LEAST DIGIT</th>
                                    </>
                                )}
                                <th>EVEN%</th>
                                <th>ODD%</th>
                                <th>RISE%</th>
                                <th>FALL%</th>
                                <th>OVER 4%</th>
                                <th>UNDER 5%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allStats.map(s => {
                                const hasSignal = s.signal.type !== null;
                                return (
                                    <tr key={s.symbol} className={`sa__mkt-row${hasSignal ? ' sa__mkt-row--signal' : ''}`}>
                                        <td className='sa__mkt-label'>
                                            {s.label}
                                            {hasSignal && (
                                                <span className={`sa__mkt-signal-badge ${SIGNAL_COLORS[s.signal.type!]}`}>
                                                    {s.signal.type === 'over4' ? 'OVER 4' : s.signal.type === 'under5' ? 'UNDER 5' : s.signal.type!.toUpperCase()}
                                                </span>
                                            )}
                                        </td>
                                        <td className='sa__mkt-price'>{s.currentPrice}</td>
                                        {summaryView === 'digits' ? (
                                            <>
                                                <td><DigitCircle digit={s.most.digit} pct={s.most.pct} color='green' /></td>
                                                <td><DigitCircle digit={s.secondMost.digit} pct={s.secondMost.pct} color='blue' /></td>
                                                <td><DigitCircle digit={s.least.digit} pct={s.least.pct} color='red' /></td>
                                                <td><DigitCircle digit={s.secondLeast.digit} pct={s.secondLeast.pct} color='yellow' /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td><span className='sa__inline-digit sa__inline-digit--green'>{s.most.digit} ({s.most.pct.toFixed(1)}%)</span></td>
                                                <td><span className='sa__inline-digit sa__inline-digit--red'>{s.least.digit} ({s.least.pct.toFixed(1)}%)</span></td>
                                            </>
                                        )}
                                        <td>{s.evenPct.toFixed(1)} %</td>
                                        <td>{s.oddPct.toFixed(1)} %</td>
                                        <td>{s.risePct.toFixed(1)} %</td>
                                        <td>{s.fallPct.toFixed(1)} %</td>
                                        <td className={s.over4Pct > 55 ? 'sa__cell--highlight' : ''}>{s.over4Pct.toFixed(1)} %</td>
                                        <td className={s.under5Pct > 55 ? 'sa__cell--highlight' : ''}>{s.under5Pct.toFixed(1)} %</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// TAB: Detailed
// ════════════════════════════════════════════════════════════════════════════
const DetailedTab = ({ markets }: { markets: Record<string, MarketStats> }) => {
    const [symbol, setSymbol] = useState('R_100');
    const [comparison, setComparison] = useState('evenodd');
    const [showAll, setShowAll] = useState(false);

    const m = markets[symbol];
    const ticks = m.ticks;

    const patternTicks = showAll ? ticks.slice(-20) : ticks.slice(-8);

    const getLabel = (t: TickEntry) => {
        if (comparison === 'evenodd') return t.digit % 2 === 0 ? 'E' : 'O';
        if (comparison === 'risefall') return t.direction === 'rise' ? 'R' : 'F';
        if (comparison === 'overunder') return t.digit > 4 ? 'O' : t.digit < 5 ? 'U' : '=';
        if (comparison === 'matchdiff') return t.digit === 5 ? 'M' : 'D';
        return '';
    };
    const getPatternClass = (t: TickEntry) => {
        const lbl = getLabel(t);
        if (comparison === 'evenodd') return lbl === 'E' ? 'sa__pat-cell--blue' : 'sa__pat-cell--red';
        if (comparison === 'risefall') return lbl === 'R' ? 'sa__pat-cell--blue' : 'sa__pat-cell--red';
        if (comparison === 'overunder') {
            if (lbl === 'O') return 'sa__pat-cell--blue';
            if (lbl === '=') return 'sa__pat-cell--purple';
            return 'sa__pat-cell--red';
        }
        if (comparison === 'matchdiff') return lbl === 'M' ? 'sa__pat-cell--blue' : 'sa__pat-cell--red';
        return 'sa__pat-cell--red';
    };

    const computeWindowStats = (size: number) => {
        const slice = ticks.slice(-size);
        const digits = slice.map(t => t.digit);
        const total = slice.length || 1;
        if (comparison === 'evenodd') {
            const evenCount = digits.filter(d => d % 2 === 0).length;
            const oddCount = total - evenCount;
            return { leftPct: (evenCount / total) * 100, leftCount: evenCount, rightCount: oddCount, leftLabel: 'Even', rightLabel: 'Odd' };
        }
        if (comparison === 'risefall') {
            const directed = slice.filter(t => t.direction !== null);
            const riseCount = directed.filter(t => t.direction === 'rise').length;
            const fallCount = directed.length - riseCount;
            const dTotal = directed.length || 1;
            return { leftPct: (riseCount / dTotal) * 100, leftCount: riseCount, rightCount: fallCount, leftLabel: 'Rise', rightLabel: 'Fall' };
        }
        if (comparison === 'overunder') {
            const over = digits.filter(d => d > 4).length;
            const under = digits.filter(d => d < 5).length;
            const ouTotal = over + under || 1;
            return { leftPct: (over / ouTotal) * 100, leftCount: over, rightCount: under, leftLabel: 'Over 4', rightLabel: 'Under 5' };
        }
        if (comparison === 'matchdiff') {
            const match = digits.filter(d => d === 5).length;
            const differ = total - match;
            return { leftPct: (match / total) * 100, leftCount: match, rightCount: differ, leftLabel: 'Matches 5', rightLabel: 'Differs' };
        }
        return { leftPct: 50, leftCount: 0, rightCount: 0, leftLabel: 'Left', rightLabel: 'Right' };
    };

    return (
        <div className='sa__detailed'>
            {/* ── Controls ── */}
            <div className='sa__detailed-controls'>
                <div className='sa__control-group'>
                    <label className='sa__control-label'>MARKET:</label>
                    <select className='sa__control-select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                        {SYMBOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                <div className='sa__control-group'>
                    <label className='sa__control-label'>COMPARISON:</label>
                    <select className='sa__control-select' value={comparison} onChange={e => setComparison(e.target.value)}>
                        {COMPARISON_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>
                <div className='sa__current-price-display'>
                    {m.currentPrice}
                </div>
            </div>

            {/* ── Tick pattern ── */}
            <div className='sa__pattern-section'>
                <p className='sa__pattern-label'>LAST {showAll ? '20' : '8'} TICKS PATTERN:</p>
                <div className='sa__pattern-row'>
                    {patternTicks.map((t, i) => {
                        const lbl = getLabel(t);
                        const cls = getPatternClass(t);
                        return (
                            <span key={`${t.epoch}-${i}`} className={`sa__pat-cell ${cls}`}>{lbl}</span>
                        );
                    })}
                    <button className='sa__show-more-btn' onClick={() => setShowAll(v => !v)}>
                        {showAll ? 'Show Less' : 'Show More'}
                    </button>
                </div>
            </div>

            {/* ── Window rows ── */}
            <div className='sa__window-rows'>
                {WINDOW_SIZES.map((size, i) => {
                    const ws = computeWindowStats(size);
                    return (
                        <div key={size} className='sa__window-row'>
                            <p className='sa__window-label'><strong>#{`Row${i + 1}`}:</strong> {size} ticks</p>
                            <SplitBar
                                leftLabel={ws.leftLabel}
                                leftPct={ws.leftPct}
                                rightLabel={ws.rightLabel}
                                leftCount={ws.leftCount}
                                rightCount={ws.rightCount}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// TAB: Tick Analyser (mini)
// ════════════════════════════════════════════════════════════════════════════
const TickAnalyserTab = ({ markets }: { markets: Record<string, MarketStats> }) => {
    const [symbol, setSymbol] = useState('R_100');
    const m = markets[symbol];
    const stats = useMemo(() => computeStats(m.ticks, 120), [m.ticks]);

    const last30 = m.ticks.slice(-30);

    return (
        <div className='sa__tick-analyser'>
            <div className='sa__ta-controls'>
                <select className='sa__control-select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {SYMBOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className='sa__ta-price'>{m.currentPrice}</span>
                <span className={`sa__ta-badge${m.isConnected ? ' sa__ta-badge--live' : ''}`}>
                    <span className='sa__ta-dot' />
                    {m.isConnected ? 'Live' : 'Connecting…'}
                </span>
            </div>

            <div className='sa__ta-stats-grid'>
                <div className='sa__ta-stat'><span className='sa__ta-stat-val'>{stats.evenPct.toFixed(1)}%</span><span className='sa__ta-stat-lbl'>Even</span></div>
                <div className='sa__ta-stat'><span className='sa__ta-stat-val'>{stats.oddPct.toFixed(1)}%</span><span className='sa__ta-stat-lbl'>Odd</span></div>
                <div className='sa__ta-stat'><span className='sa__ta-stat-val'>{stats.risePct.toFixed(1)}%</span><span className='sa__ta-stat-lbl'>Rise</span></div>
                <div className='sa__ta-stat'><span className='sa__ta-stat-val'>{stats.fallPct.toFixed(1)}%</span><span className='sa__ta-stat-lbl'>Fall</span></div>
                <div className='sa__ta-stat'><span className='sa__ta-stat-val'>{stats.over4Pct.toFixed(1)}%</span><span className='sa__ta-stat-lbl'>Over 4</span></div>
                <div className='sa__ta-stat'><span className='sa__ta-stat-val'>{stats.under5Pct.toFixed(1)}%</span><span className='sa__ta-stat-lbl'>Under 5</span></div>
            </div>

            <div className='sa__ta-dist'>
                <p className='sa__ta-dist-title'>Digit Distribution (Last 120 Ticks)</p>
                <div className='sa__ta-digits'>
                    {stats.dist.map(({ digit, pct }) => (
                        <div key={digit} className='sa__ta-digit-col'>
                            <div className='sa__ta-bar-wrap'>
                                <div className='sa__ta-bar' style={{ height: `${Math.max(pct * 3, 4)}px` }} />
                            </div>
                            <span className='sa__ta-digit-num'>{digit}</span>
                            <span className='sa__ta-digit-pct'>{pct.toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className='sa__ta-stream'>
                <p className='sa__ta-dist-title'>Last 30 Digits</p>
                <div className='sa__ta-stream-row'>
                    {last30.map((t, i) => (
                        <span key={`${t.epoch}-${i}`} className={`sa__ta-cell sa__ta-cell--${t.digit % 2 === 0 ? 'even' : 'odd'}`}>
                            {t.digit}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// Root component
// ════════════════════════════════════════════════════════════════════════════
type Tab = 'summary' | 'detailed' | 'tick-analyser';

const SmartAnalysis = () => {
    const [activeTab, setActiveTab] = useState<Tab>('summary');
    const [sampleSize, setSampleSize] = useState(120);
    const markets = useAllMarkets();

    const tabs: { id: Tab; label: string }[] = [
        { id: 'summary', label: 'Summary' },
        { id: 'detailed', label: 'Detailed' },
        { id: 'tick-analyser', label: 'Tick Analyser' },
    ];

    return (
        <div className='sa'>
            <div className='sa__tab-bar'>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        className={`sa__tab${activeTab === t.id ? ' sa__tab--active' : ''}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className='sa__body'>
                {activeTab === 'summary' && (
                    <SummaryTab markets={markets} sampleSize={sampleSize} onSampleSizeChange={setSampleSize} />
                )}
                {activeTab === 'detailed' && <DetailedTab markets={markets} />}
                {activeTab === 'tick-analyser' && <TickAnalyserTab markets={markets} />}
            </div>
        </div>
    );
};

export default SmartAnalysis;
