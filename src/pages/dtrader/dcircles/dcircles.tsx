import { useEffect, useMemo, useRef, useState } from 'react';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import './dcircles.scss';

const SYMBOLS = [
    { label: 'Volatility 100 (1s) Index', value: '1HZ100V' },
    { label: 'Volatility 75 (1s) Index', value: '1HZ75V' },
    { label: 'Volatility 50 (1s) Index', value: '1HZ50V' },
    { label: 'Volatility 25 (1s) Index', value: '1HZ25V' },
    { label: 'Volatility 10 (1s) Index', value: '1HZ10V' },
    { label: 'Volatility 100 Index', value: 'R_100' },
    { label: 'Volatility 75 Index', value: 'R_75' },
    { label: 'Volatility 50 Index', value: 'R_50' },
    { label: 'Volatility 25 Index', value: 'R_25' },
    { label: 'Volatility 10 Index', value: 'R_10' },
];

type TradeType = 'evenodd' | 'risefall' | 'overunder' | 'matchdiff';
type TickEntry = { digit: number; price: string; epoch: number; direction: 'rise' | 'fall' | null };

// ── Shared tick stream hook ───────────────────────────────────────────────────
const useDigitStream = (symbol: string) => {
    const [ticks, setTicks] = useState<TickEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subRef = useRef<any>(null);
    const prevPriceRef = useRef<number | null>(null);

    useEffect(() => {
        let mounted = true;
        setTicks([]);
        setIsConnected(false);
        prevPriceRef.current = null;

        const parseTick = (quote: number, pip: number, epoch: number, prev: number | null): TickEntry => {
            const priceStr = quote.toFixed(pip);
            const digit = parseInt(priceStr[priceStr.length - 1]);
            return { digit, price: priceStr, epoch, direction: prev === null ? null : quote > prev ? 'rise' : 'fall' };
        };

        const connect = async () => {
            subRef.current?.unsubscribe?.();
            try {
                apiRef.current?.disconnect?.();
            } catch (_e) {
                /* noop */
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const api = generateDerivApiInstance() as any;
            apiRef.current = api;
            await new Promise<void>(resolve => {
                if (api.connection.readyState === WebSocket.OPEN) resolve();
                else api.connection.addEventListener('open', () => resolve(), { once: true });
            });
            if (!mounted) return;
            try {
                const history = await api.send({ ticks_history: symbol, count: 500, end: 'latest', style: 'ticks' });
                if (mounted && history?.history) {
                    const { prices, times } = history.history;
                    const pip = history.pip_size ?? 2;
                    const historical: TickEntry[] = [];
                    prices.forEach((q: number, i: number) =>
                        historical.push(parseTick(q, pip, times[i], i === 0 ? null : prices[i - 1]))
                    );
                    prevPriceRef.current = prices[prices.length - 1] ?? null;
                    setTicks(historical);
                }
            } catch (_e) {
                /* noop */
            }
            if (!mounted) return;
            setIsConnected(true);
            const stream = api.subscribe({ ticks: symbol, subscribe: 1 });
            subRef.current = stream.subscribe({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                next: (res: any) => {
                    if (!mounted || !res?.tick) return;
                    const { quote, pip_size, epoch } = res.tick;
                    const pip = pip_size ?? 2;
                    const entry = parseTick(quote as number, pip, epoch, prevPriceRef.current);
                    prevPriceRef.current = quote as number;
                    setTicks(prev => [...prev, entry].slice(-2000));
                },
                error: () => {
                    if (mounted) setIsConnected(false);
                },
            });
        };

        void connect();
        return () => {
            mounted = false;
            subRef.current?.unsubscribe?.();
            try {
                apiRef.current?.disconnect?.();
            } catch (_e) {
                /* noop */
            }
        };
    }, [symbol]);

    return { ticks, isConnected };
};

// ── Split stat bar ────────────────────────────────────────────────────────────
const StatBar = ({
    leftLabel,
    leftPct,
    rightLabel,
    leftColor = 'teal',
    rightColor = 'red',
    large = false,
}: {
    leftLabel: string;
    leftPct: number;
    rightLabel: string;
    leftColor?: 'teal' | 'purple';
    rightColor?: 'red' | 'orange';
    large?: boolean;
}) => (
    <div className={`dcircles__bar${large ? ' dcircles__bar--large' : ''}`}>
        <div className={`dcircles__bar-seg dcircles__bar-seg--${leftColor}`} style={{ flex: Math.max(leftPct, 1) }}>
            <span className='dcircles__bar-label'>{leftLabel}</span>
            <span className='dcircles__bar-pct'>{leftPct.toFixed(1)}%</span>
        </div>
        <div
            className={`dcircles__bar-seg dcircles__bar-seg--${rightColor}`}
            style={{ flex: Math.max(100 - leftPct, 1) }}
        >
            <span className='dcircles__bar-pct'>{(100 - leftPct).toFixed(1)}%</span>
            <span className='dcircles__bar-label'>{rightLabel}</span>
        </div>
    </div>
);

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — DCircles (multi-market grid)
// ════════════════════════════════════════════════════════════════════════════

const MarketCard = ({ symbol, label, sampleSize }: { symbol: string; label: string; sampleSize: number }) => {
    const [targetDigit, setTargetDigit] = useState(4);
    const { ticks, isConnected } = useDigitStream(symbol);

    const slice = ticks.slice(-sampleSize);
    const digits = slice.map(t => t.digit);
    const total = digits.length || 1;
    const lastTick = ticks[ticks.length - 1];
    const lastDigit = lastTick?.digit ?? -1;
    const lastPrice = lastTick?.price ?? '—';

    const distribution = useMemo(() => {
        const counts = Array(10).fill(0);
        digits.forEach(d => counts[d]++);
        return counts.map((count, digit) => ({
            digit,
            count,
            pct: total > 1 ? ((count / total) * 100).toFixed(1) : '0.0',
        }));
    }, [digits, total]);

    const sorted = [...distribution].sort((a, b) => b.count - a.count);
    const hotDigit = sorted[0]?.digit ?? -1;
    const coldDigit = sorted[sorted.length - 1]?.digit ?? -1;

    const evenPct = (digits.filter(d => d % 2 === 0).length / total) * 100;
    const directed = slice.filter(t => t.direction !== null);
    const risePct = (directed.filter(t => t.direction === 'rise').length / (directed.length || 1)) * 100;
    const overCount = digits.filter(d => d > targetDigit).length;
    const underCount = digits.filter(d => d < targetDigit).length;
    const overBarPct = (overCount / (overCount + underCount || 1)) * 100;
    const last10 = ticks.slice(-10);

    return (
        <div className='dcircles__market-card'>
            <div className='dcircles__mc-header'>
                <div className='dcircles__mc-title-block'>
                    <span className='dcircles__mc-name'>{label}</span>
                    <span className='dcircles__mc-price'>{lastPrice}</span>
                </div>
                <div className='dcircles__mc-meta'>
                    <span className='dcircles__mc-sample'>Last {sampleSize}</span>
                    <span
                        className={`dcircles__badge dcircles__badge--sm${isConnected ? ' dcircles__badge--live' : ''}`}
                    >
                        <span className='dcircles__badge-dot' />
                    </span>
                </div>
            </div>

            <div className='dcircles__mc-circles'>
                {distribution.map(({ digit, pct }) => {
                    const isHot = digit === hotDigit;
                    const isCold = digit === coldDigit && coldDigit !== hotDigit;
                    const isLast = digit === lastDigit;
                    return (
                        <div key={digit} className='dcircles__mc-digit-col'>
                            <div
                                className={[
                                    'dcircles__mc-circle',
                                    isHot ? 'dcircles__mc-circle--hot' : '',
                                    isCold ? 'dcircles__mc-circle--cold' : '',
                                    isLast ? 'dcircles__mc-circle--last' : '',
                                    !isHot && !isCold
                                        ? digit % 2 === 0
                                            ? 'dcircles__mc-circle--even'
                                            : 'dcircles__mc-circle--odd'
                                        : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                <span className='dcircles__mc-num'>{digit}</span>
                                <span className='dcircles__mc-pct'>{pct}%</span>
                            </div>
                            <span className={`dcircles__mc-arrow${isLast ? '' : ' dcircles__mc-arrow--hidden'}`}>
                                ▲
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className='dcircles__mc-stream'>
                {Array.from({ length: 10 }, (_, i) => {
                    const offset = i - (10 - last10.length);
                    const t = offset >= 0 ? last10[offset] : null;
                    return t ? (
                        <span
                            key={`${t.epoch}-${i}`}
                            className={[
                                'dcircles__mc-stream-cell',
                                t.digit % 2 === 0 ? 'dcircles__mc-stream-cell--even' : 'dcircles__mc-stream-cell--odd',
                                i === 9 && offset >= 0 ? 'dcircles__mc-stream-cell--latest' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            {t.digit}
                        </span>
                    ) : (
                        <span key={`empty-${i}`} className='dcircles__mc-stream-cell dcircles__mc-stream-cell--empty' />
                    );
                })}
            </div>

            <div className='dcircles__mc-bars'>
                <StatBar leftLabel='Even' leftPct={evenPct} rightLabel='Odd' />
                <StatBar leftLabel='Rise' leftPct={risePct} rightLabel='Fall' />
                <div className='dcircles__mc-ou'>
                    <div className='dcircles__mc-digit-row'>
                        {Array.from({ length: 10 }, (_, d) => (
                            <button
                                key={d}
                                className={`dcircles__mc-digit-btn${d === targetDigit ? ' dcircles__mc-digit-btn--active' : ''}`}
                                onClick={() => setTargetDigit(d)}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                    <StatBar
                        leftLabel={`Over ${targetDigit}`}
                        leftPct={overBarPct}
                        rightLabel={`Under ${targetDigit}`}
                    />
                    <div className='dcircles__mc-ou-counts'>
                        <span>Over: {overCount} ticks</span>
                        <span>Under: {underCount} ticks</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DCirclesTab = ({ sampleSize }: { sampleSize: number }) => (
    <div className='dcircles__grid'>
        {SYMBOLS.map(s => (
            <MarketCard key={s.value} symbol={s.value} label={s.label} sampleSize={sampleSize} />
        ))}
    </div>
);

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — Normal (single market, focused trade-type view)
// ════════════════════════════════════════════════════════════════════════════

const TRADE_TYPES: { id: TradeType; label: string }[] = [
    { id: 'evenodd', label: 'Even / Odd' },
    { id: 'risefall', label: 'Rise / Fall' },
    { id: 'overunder', label: 'Over / Under' },
    { id: 'matchdiff', label: 'Matches / Differs' },
];

const NormalTab = ({ sampleSize }: { sampleSize: number }) => {
    const [symbol, setSymbol] = useState('1HZ100V');
    const [tradeType, setTradeType] = useState<TradeType>('evenodd');
    const [targetDigit, setTargetDigit] = useState(5);

    const { ticks, isConnected } = useDigitStream(symbol);

    const slice = ticks.slice(-sampleSize);
    const digits = slice.map(t => t.digit);
    const total = digits.length || 1;
    const lastTick = ticks[ticks.length - 1];
    const lastDigit = lastTick?.digit ?? -1;
    const lastPrice = lastTick?.price ?? '—';

    const distribution = useMemo(() => {
        const counts = Array(10).fill(0);
        digits.forEach(d => counts[d]++);
        return counts.map((count, digit) => ({
            digit,
            count,
            pct: total > 1 ? ((count / total) * 100).toFixed(1) : '0.0',
        }));
    }, [digits, total]);

    const sorted = [...distribution].sort((a, b) => b.count - a.count);
    const hotDigit = sorted[0]?.digit ?? -1;
    const coldDigit = sorted[sorted.length - 1]?.digit ?? -1;

    // Even/Odd
    const evenCount = digits.filter(d => d % 2 === 0).length;
    const oddCount = total - evenCount;
    const evenPct = (evenCount / total) * 100;

    // Streak
    const computeStreak = (predicate: (d: TickEntry) => boolean) => {
        let streak = 0;
        for (let i = ticks.length - 1; i >= 0; i--) {
            if (predicate(ticks[i])) streak++;
            else break;
        }
        return streak;
    };

    // Rise/Fall
    const directed = slice.filter(t => t.direction !== null);
    const riseCount = directed.filter(t => t.direction === 'rise').length;
    const fallCount = directed.length - riseCount;
    const risePct = (riseCount / (directed.length || 1)) * 100;

    // Over/Under
    const overCount = digits.filter(d => d > targetDigit).length;
    const equalCount = digits.filter(d => d === targetDigit).length;
    const underCount = digits.filter(d => d < targetDigit).length;
    const ouTotal = overCount + underCount || 1;
    const overBarPct = (overCount / ouTotal) * 100;

    // Matches/Differs
    const matchCount = digits.filter(d => d === targetDigit).length;
    const differCount = total - matchCount;
    const matchPct = (matchCount / total) * 100;

    // Streak calcs
    const evenStreak = computeStreak(t => t.digit % 2 === 0);
    const oddStreak = computeStreak(t => t.digit % 2 !== 0);
    const riseStreak = computeStreak(t => t.direction === 'rise');
    const fallStreak = computeStreak(t => t.direction === 'fall');
    const overStreak = computeStreak(t => t.digit > targetDigit);
    const underStreak = computeStreak(t => t.digit < targetDigit);
    const matchStreak = computeStreak(t => t.digit === targetDigit);
    const diffStreak = computeStreak(t => t.digit !== targetDigit);

    const last50 = ticks.slice(-50);

    return (
        <div className='dcircles__normal'>
            {/* ── Controls ── */}
            <div className='dcircles__nm-controls'>
                <select className='dcircles__select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {SYMBOLS.map(s => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
                <span className={`dcircles__badge${isConnected ? ' dcircles__badge--live' : ''}`}>
                    <span className='dcircles__badge-dot' />
                    {isConnected ? 'Live' : 'Connecting…'}
                </span>
                <div className='dcircles__nm-trade-types'>
                    {TRADE_TYPES.map(tt => (
                        <button
                            key={tt.id}
                            className={`dcircles__nm-tt-btn${tradeType === tt.id ? ' dcircles__nm-tt-btn--active' : ''}`}
                            onClick={() => setTradeType(tt.id)}
                        >
                            {tt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Market header ── */}
            <div className='dcircles__nm-market-header'>
                <div className='dcircles__nm-price'>{lastPrice}</div>
                <div className='dcircles__nm-market-name'>{SYMBOLS.find(s => s.value === symbol)?.label}</div>
            </div>

            {/* ── Digit distribution circles ── */}
            <div className='dcircles__nm-circles'>
                {distribution.map(({ digit, pct }) => {
                    const isHot = digit === hotDigit;
                    const isCold = digit === coldDigit && coldDigit !== hotDigit;
                    const isLast = digit === lastDigit;
                    const isTgt = (tradeType === 'overunder' || tradeType === 'matchdiff') && digit === targetDigit;
                    return (
                        <div key={digit} className='dcircles__nm-digit-col'>
                            <div
                                className={[
                                    'dcircles__nm-circle',
                                    isHot ? 'dcircles__mc-circle--hot' : '',
                                    isCold ? 'dcircles__mc-circle--cold' : '',
                                    isTgt ? 'dcircles__nm-circle--target' : '',
                                    isLast ? 'dcircles__mc-circle--last' : '',
                                    !isHot && !isCold
                                        ? digit % 2 === 0
                                            ? 'dcircles__mc-circle--even'
                                            : 'dcircles__mc-circle--odd'
                                        : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                <span className='dcircles__nm-num'>{digit}</span>
                                <span className='dcircles__nm-pct'>{pct}%</span>
                            </div>
                            <span className={`dcircles__mc-arrow${isLast ? '' : ' dcircles__mc-arrow--hidden'}`}>
                                ▲
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* ── Trade-type stats ── */}
            {tradeType === 'evenodd' && (
                <div className='dcircles__nm-stats'>
                    <StatBar leftLabel='Even' leftPct={evenPct} rightLabel='Odd' large />
                    <div className='dcircles__nm-split-cards'>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--teal'>
                            <span className='dcircles__nm-stat-big'>{evenPct.toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>EVEN</span>
                            <span className='dcircles__nm-stat-sub'>{evenCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {evenStreak}</span>
                        </div>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--red'>
                            <span className='dcircles__nm-stat-big'>{(100 - evenPct).toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>ODD</span>
                            <span className='dcircles__nm-stat-sub'>{oddCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {oddStreak}</span>
                        </div>
                    </div>
                </div>
            )}

            {tradeType === 'risefall' && (
                <div className='dcircles__nm-stats'>
                    <StatBar leftLabel='Rise' leftPct={risePct} rightLabel='Fall' large />
                    <div className='dcircles__nm-split-cards'>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--teal'>
                            <span className='dcircles__nm-stat-big'>{risePct.toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>RISE</span>
                            <span className='dcircles__nm-stat-sub'>{riseCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {riseStreak}</span>
                        </div>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--red'>
                            <span className='dcircles__nm-stat-big'>{(100 - risePct).toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>FALL</span>
                            <span className='dcircles__nm-stat-sub'>{fallCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {fallStreak}</span>
                        </div>
                    </div>
                </div>
            )}

            {tradeType === 'overunder' && (
                <div className='dcircles__nm-stats'>
                    <div className='dcircles__nm-digit-picker'>
                        <span className='dcircles__nm-picker-label'>Select digit</span>
                        <div className='dcircles__nm-picker-row'>
                            {Array.from({ length: 10 }, (_, d) => (
                                <button
                                    key={d}
                                    className={`dcircles__nm-digit-btn${d === targetDigit ? ' dcircles__nm-digit-btn--active' : ''}`}
                                    onClick={() => setTargetDigit(d)}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <StatBar
                        leftLabel={`Over ${targetDigit}`}
                        leftPct={overBarPct}
                        rightLabel={`Under ${targetDigit}`}
                        large
                    />
                    <div className='dcircles__nm-triple-cards'>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--teal'>
                            <span className='dcircles__nm-stat-big'>{((overCount / total) * 100).toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>OVER {targetDigit}</span>
                            <span className='dcircles__nm-stat-sub'>{overCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {overStreak}</span>
                        </div>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--purple'>
                            <span className='dcircles__nm-stat-big'>{((equalCount / total) * 100).toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>EQUALS {targetDigit}</span>
                            <span className='dcircles__nm-stat-sub'>{equalCount} ticks</span>
                        </div>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--red'>
                            <span className='dcircles__nm-stat-big'>{((underCount / total) * 100).toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>UNDER {targetDigit}</span>
                            <span className='dcircles__nm-stat-sub'>{underCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {underStreak}</span>
                        </div>
                    </div>
                </div>
            )}

            {tradeType === 'matchdiff' && (
                <div className='dcircles__nm-stats'>
                    <div className='dcircles__nm-digit-picker'>
                        <span className='dcircles__nm-picker-label'>Select digit</span>
                        <div className='dcircles__nm-picker-row'>
                            {Array.from({ length: 10 }, (_, d) => (
                                <button
                                    key={d}
                                    className={`dcircles__nm-digit-btn${d === targetDigit ? ' dcircles__nm-digit-btn--active' : ''}`}
                                    onClick={() => setTargetDigit(d)}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <StatBar
                        leftLabel={`Matches ${targetDigit}`}
                        leftPct={matchPct}
                        rightLabel='Differs'
                        leftColor='purple'
                        large
                    />
                    <div className='dcircles__nm-split-cards'>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--purple'>
                            <span className='dcircles__nm-stat-big'>{matchPct.toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>MATCHES {targetDigit}</span>
                            <span className='dcircles__nm-stat-sub'>{matchCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {matchStreak}</span>
                        </div>
                        <div className='dcircles__nm-stat-card dcircles__nm-stat-card--red'>
                            <span className='dcircles__nm-stat-big'>{(100 - matchPct).toFixed(1)}%</span>
                            <span className='dcircles__nm-stat-label'>DIFFERS</span>
                            <span className='dcircles__nm-stat-sub'>{differCount} ticks</span>
                            <span className='dcircles__nm-streak'>Streak: {diffStreak}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Last 50 pattern ── */}
            <div className='dcircles__nm-pattern-section'>
                <p className='dcircles__nm-pattern-title'>LAST 50 DIGITS</p>
                <div className='dcircles__nm-pattern'>
                    {last50.map((t, i) => {
                        let cls = '';
                        if (tradeType === 'evenodd') cls = t.digit % 2 === 0 ? 'even' : 'odd';
                        if (tradeType === 'risefall') cls = t.direction === 'rise' ? 'even' : 'odd';
                        if (tradeType === 'overunder')
                            cls = t.digit > targetDigit ? 'even' : t.digit === targetDigit ? 'equal' : 'odd';
                        if (tradeType === 'matchdiff') cls = t.digit === targetDigit ? 'match' : 'odd';
                        return (
                            <span
                                key={`${t.epoch}-${i}`}
                                className={`dcircles__nm-pat-cell dcircles__nm-pat-cell--${cls}`}
                            >
                                {t.digit}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// Root: tabbed Analysis Tool
// ════════════════════════════════════════════════════════════════════════════

const SAMPLE_PRESETS = [50, 100, 200, 500, 1000, 2000];

// ── Combobox: type a number or pick from dropdown ─────────────────────────────
const SampleCombobox = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => {
    const [inputVal, setInputVal] = useState(String(value));
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const apply = (raw: string) => {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 10 && n <= 5000) {
            onChange(n);
            setInputVal(String(n));
        } else setInputVal(String(value));
    };

    const pick = (n: number) => {
        onChange(n);
        setInputVal(String(n));
        setOpen(false);
    };

    return (
        <div className='dcircles__combo' ref={wrapRef}>
            <span className='dcircles__sample-label'>Last</span>
            <div className={`dcircles__combo-box${open ? ' dcircles__combo-box--open' : ''}`}>
                <input
                    className='dcircles__combo-input'
                    type='number'
                    min={10}
                    max={5000}
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onBlur={e => apply(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            apply(inputVal);
                            setOpen(false);
                        }
                    }}
                />
                <button
                    className='dcircles__combo-trigger'
                    onClick={() => setOpen(v => !v)}
                    aria-label='Pick preset'
                    tabIndex={-1}
                >
                    <svg width='11' height='11' viewBox='0 0 12 12' fill='currentColor'>
                        <path d={open ? 'M6 4L1 9h10z' : 'M6 8L1 3h10z'} />
                    </svg>
                </button>

                {open && (
                    <ul className='dcircles__combo-dropdown'>
                        {SAMPLE_PRESETS.map(n => (
                            <li key={n}>
                                <button
                                    className={`dcircles__combo-option${value === n ? ' dcircles__combo-option--active' : ''}`}
                                    onClick={() => pick(n)}
                                >
                                    {n} ticks
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <span className='dcircles__sample-label'>ticks</span>
        </div>
    );
};

const DCircles = () => {
    const [activeTab, setActiveTab] = useState<'dcircles' | 'normal'>('dcircles');
    const [sampleSize, setSampleSize] = useState(120);

    return (
        <div className='dcircles'>
            <div className='dcircles__tab-bar'>
                <div className='dcircles__tabs'>
                    <button
                        className={`dcircles__tab${activeTab === 'dcircles' ? ' dcircles__tab--active' : ''}`}
                        onClick={() => setActiveTab('dcircles')}
                    >
                        DCircles
                    </button>
                    <button
                        className={`dcircles__tab${activeTab === 'normal' ? ' dcircles__tab--active' : ''}`}
                        onClick={() => setActiveTab('normal')}
                    >
                        Normal
                    </button>
                </div>

                <SampleCombobox value={sampleSize} onChange={setSampleSize} />
            </div>

            {activeTab === 'dcircles' && <DCirclesTab sampleSize={sampleSize} />}
            {activeTab === 'normal' && <NormalTab sampleSize={sampleSize} />}
        </div>
    );
};

export default DCircles;
