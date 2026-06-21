import React, { useEffect, useRef, useState } from 'react';
import { FaPlay, FaStop } from 'react-icons/fa';
import { getAppId, getSocketURL } from '@/components/shared';
import './marketview.css';

const INDICES = [
    { value: 'R_10', label: 'Volatility 10' },
    { value: 'R_25', label: 'Volatility 25' },
    { value: 'R_50', label: 'Volatility 50' },
    { value: 'R_75', label: 'Volatility 75' },
    { value: 'R_100', label: 'Volatility 100' },
    { value: '1HZ10V', label: 'Volatility 10 (1s)' },
    { value: '1HZ15V', label: 'Volatility 15 (1s)' },
    { value: '1HZ25V', label: 'Volatility 25 (1s)' },
    { value: '1HZ30V', label: 'Volatility 30 (1s)' },
    { value: '1HZ50V', label: 'Volatility 50 (1s)' },
    { value: '1HZ75V', label: 'Volatility 75 (1s)' },
    { value: '1HZ90V', label: 'Volatility 90 (1s)' },
    { value: '1HZ100V', label: 'Volatility 100 (1s)' },
];

const getDecimalPlaces = (sym: string) => {
    if (['1HZ15V', '1HZ30V', '1HZ90V'].includes(sym)) return 3;
    if (sym.startsWith('1HZ')) return 2;
    if (sym === 'R_100') return 2;
    if (sym === 'R_75' || sym === 'R_50') return 4;
    if (sym === 'R_25' || sym === 'R_10') return 3;
    return 3;
};

const extractLastDigit = (price: number, sym: string) => {
    const decimals = getDecimalPlaces(sym);
    const factor = Math.pow(10, decimals);
    return Math.round(price * factor) % 10;
};

type Stats = {
    over: string;
    under: string;
    even: string;
    odd: string;
    rise: string;
    fall: string;
    equal: string;
    matches: string;
    differs: string;
    digits: string[];
};

const calculateStats = (tickArr: number[]): Stats | null => {
    if (tickArr.length < 2) return null;

    let countOver = 0, countUnder = 0, countEven = 0, countOdd = 0;
    let countRise = 0, countFall = 0, countEqual = 0;
    let countMatches = 0, countDiffers = 0;
    const digitCounts = Array(10).fill(0);

    for (let i = 1; i < tickArr.length; i++) {
        const curr = tickArr[i];
        const prev = tickArr[i - 1];
        if (curr % 2 === 0) countEven++; else countOdd++;
        if (curr > prev) countRise++;
        else if (curr < prev) countFall++;
        else countEqual++;
        if (curr >= 5) countOver++; else countUnder++;
        if (curr === prev) countMatches++; else countDiffers++;
        digitCounts[curr]++;
    }

    const total = tickArr.length - 1;
    const totalRiseFall = countRise + countFall + countEqual;
    const pct = (v: number) => (v / total).toFixed(2);

    return {
        over: pct(countOver),
        under: pct(countUnder),
        even: pct(countEven),
        odd: pct(countOdd),
        rise: totalRiseFall ? (countRise / totalRiseFall).toFixed(2) : '0',
        fall: totalRiseFall ? (countFall / totalRiseFall).toFixed(2) : '0',
        equal: totalRiseFall ? (countEqual / totalRiseFall).toFixed(2) : '0',
        matches: pct(countMatches),
        differs: pct(countDiffers),
        digits: digitCounts.map(c => (c / total).toFixed(2)),
    };
};

type MarketviewProps = {
    isRunning: boolean;
    useBulk: boolean;
    handleToggleBot: () => void;
    sharedSymbol: string;
    setSharedSymbol: (s: string) => void;
};

const WS_URL = `wss://${getSocketURL()}/websockets/v3?app_id=${getAppId()}`;

const Marketview: React.FC<MarketviewProps> = ({
    isRunning,
    useBulk,
    handleToggleBot,
    sharedSymbol,
    setSharedSymbol,
}) => {
    const symbol = sharedSymbol;
    const setSymbol = setSharedSymbol;

    const [ticks, setTicks] = useState<number[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [tickCount, setTickCount] = useState(100);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const historyRef = useRef<number[]>([]);

    const startFeed = () => {
        if (wsRef.current) wsRef.current.close();
        setLoading(true);
        historyRef.current = [];
        setTicks([]);
        setStats(null);
        setCurrentPrice(null);

        wsRef.current = new WebSocket(WS_URL);

        wsRef.current.onopen = () => {
            wsRef.current?.send(
                JSON.stringify({ ticks_history: symbol, count: tickCount, end: 'latest', style: 'ticks' })
            );
        };

        wsRef.current.onmessage = (msg: MessageEvent) => {
            const data = JSON.parse(msg.data);

            if (data.history?.prices) {
                historyRef.current = data.history.prices.map((p: string) =>
                    extractLastDigit(Number(p), symbol)
                );
                setTicks(historyRef.current.slice(-20));
                setStats(calculateStats(historyRef.current));
                wsRef.current?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
                setLoading(false);
            }

            if (data.tick?.quote) {
                const quote = parseFloat(data.tick.quote);
                setCurrentPrice(quote);
                const digit = extractLastDigit(quote, symbol);
                historyRef.current = [...historyRef.current.slice(-tickCount + 1), digit];
                setTicks(historyRef.current.slice(-20));
                setStats(calculateStats(historyRef.current));
            }
        };

        wsRef.current.onerror = () => {
            setLoading(false);
        };
    };

    useEffect(() => {
        startFeed();
        return () => {
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [symbol, tickCount]);

    const statEntries = stats
        ? Object.entries(stats).filter(([key]) => key !== 'digits') as [string, string][]
        : [];

    return (
        <div className='deriv-compact-app-scope'>
            <div className='dt-shell'>
                <div className='dt-accent-line' />

                <header className='dt-top-bar'>
                    <div className='dt-brand-group'>
                        <div className='dt-logo-icon'>D</div>
                        <div>
                            <h1 className='dt-logo'>Market Stats</h1>
                            <div className='dt-status-indicator'>
                                <span className={`dt-dot ${loading ? 'is-loading' : 'is-live'}`} />
                                {loading ? 'SYNCHRONIZING' : 'LIVE FEED'}
                            </div>
                        </div>
                    </div>

                    <div className='dt-quick-controls'>
                        <div className='dt-input-stack'>
                            <label>Market</label>
                            <select
                                className='dt-mini-select'
                                value={symbol}
                                onChange={e => setSymbol(e.target.value)}
                            >
                                {INDICES.map(idx => (
                                    <option key={idx.value} value={idx.value}>
                                        {idx.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className='dt-input-stack'>
                            <label>Ticks to Analyze</label>
                            <input
                                className='dt-mini-input'
                                type='number'
                                value={tickCount}
                                onChange={e => setTickCount(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </header>

                {loading ? (
                    <div className='universal-loader-container'>
                        <div className='universal-loader' />
                        <p>Loading stats...</p>
                    </div>
                ) : (
                    <main className='dt-content-grid'>
                        <div className='dt-stats-row'>
                            {stats ? (
                                <>
                                    <div className='dt-panel dt-flex-3'>
                                        <div className='dt-panel-header'>Digit Distribution</div>
                                        <div className='dt-dist-grid'>
                                            {(() => {
                                                const digitNums = stats.digits.map(Number);
                                                const maxVal = Math.max(...digitNums);
                                                const minVal = Math.min(...digitNums);
                                                return stats.digits.map((val, idx) => {
                                                    const isLatest = ticks[ticks.length - 1] === idx;
                                                    const isMax = Number(val) === maxVal;
                                                    const isMin = Number(val) === minVal;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`dt-dist-square${isLatest ? ' is-hit' : ''}${isMax ? ' is-highest' : ''}${isMin ? ' is-lowest' : ''}`}
                                                        >
                                                            <div
                                                                className='dt-square-fill'
                                                                style={{ height: `${Number(val) * 100 * 2}%` }}
                                                            />
                                                            <div className='dt-square-content'>
                                                                <span className='dt-d-num'>{idx}</span>
                                                                <span className='dt-d-pct'>
                                                                    {(Number(val) * 100).toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                        <div className='inside-stat-column'>
                                            <button
                                                onClick={handleToggleBot}
                                                className={`${isRunning ? 'pro-btn-stop' : 'pro-btn-run'} stats-btn`}
                                            >
                                                {isRunning ? (
                                                    <>
                                                        <FaStop />
                                                        {useBulk ? ' STOP BULK' : ' STOP BOT'}
                                                    </>
                                                ) : (
                                                    <>
                                                        <FaPlay />
                                                        {useBulk ? ' RUN BULK' : ' RUN BOT'}
                                                    </>
                                                )}
                                            </button>
                                            {currentPrice !== null && (
                                                <span className='live-btn-price'>
                                                    <strong>
                                                        {currentPrice.toFixed(getDecimalPlaces(symbol))}
                                                    </strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className='dt-panel dt-flex-2 border-right'>
                                        <div className='dt-panel-header'>CONTRACT TYPE ANALYSIS</div>
                                        <div className='dt-metrics-inline'>
                                            {statEntries.map(([key, val]) => {
                                                const pct = (Number(val) * 100).toFixed(0);
                                                const colorClass =
                                                    Number(pct) > 54
                                                        ? 'txt-green'
                                                        : Number(pct) < 40
                                                          ? 'txt-red'
                                                          : '';
                                                return (
                                                    <div key={key} className='dt-metric-tiny'>
                                                        <span className='dt-label'>{key}</span>
                                                        <span className={`dt-val ${colorClass}`}>{pct}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className='stats-loader-container'>
                                    <div className='universal-loader' />
                                    <p>Awaiting Data...</p>
                                </div>
                            )}
                        </div>
                    </main>
                )}
            </div>
        </div>
    );
};

export default Marketview;
