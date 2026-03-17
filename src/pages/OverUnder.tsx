import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings,
    Play,
    Square,
    Activity,
    TrendingUp,
    ShieldCheck,
    Zap,
    Info,
    ChevronDown,
    ChevronUp,
    Terminal,
    Trash2,
    CheckCircle2,
    AlertCircle,
    BarChart2,
    Layers,
    RefreshCw,
    Target,
    Cpu,
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import './over-under.scss';

type Strategy = 'over_under' | 'differs' | 'rise_fall' | 'manual';

const STRATEGIES: { value: Strategy; label: string; description: string; icon: React.ReactNode; color: string }[] = [
    {
        value: 'over_under',
        label: 'Over 5 / Under 4',
        description: 'Fires both O5 and U4 on trigger digit match',
        icon: <Target size={16} />,
        color: '#007bff',
    },
    {
        value: 'differs',
        label: 'Differs (Pushback)',
        description: 'Trades digit differs after a 3+ tick surge reversal',
        icon: <Activity size={16} />,
        color: '#6f42c1',
    },
    {
        value: 'rise_fall',
        label: 'Rise / Fall',
        description: 'MACD-based trend following strategy',
        icon: <TrendingUp size={16} />,
        color: '#20c997',
    },
    {
        value: 'manual',
        label: 'Manual',
        description: 'Set your own contract type and barrier',
        icon: <Settings size={16} />,
        color: '#fd7e14',
    },
];

const OverUnder = observer(() => {
    const { over_under } = useStore();
    const {
        connection_status,
        tick_history,
        last_digit,
        is_auto_running,
        stake,
        martingale,
        is_volatility_changer,
        is_differs_mode,
        is_2term_mode,
        is_rise_fall_mode,
        is_automate,
        use_second_trigger,
        is_manual_mode,
        manual_contract_type,
        manual_barrier,
        recovery_contract_type,
        recovery_barrier,
        use_recovery_delay,
        entry_digit,
        second_entry_digit,
        is_turbo,
        selected_symbol,
        debug_info,
        is_analyzing_volatility,
        current_analyzing_symbol,
        is_authorizing,
        setStake,
        setMartingale,
        setIsVolatilityChanger,
        setIsDiffersMode,
        setIs2termMode,
        setIsRiseFallMode,
        setIsAutomate,
        setUseSecondTrigger,
        setIsManualMode,
        setManualContractType,
        setManualBarrier,
        setRecoveryContractType,
        setRecoveryBarrier,
        setUseRecoveryDelay,
        setEntryDigit,
        setSecondEntryDigit,
        setIsTurbo,
        setSelectedSymbol,
        connectWebSocket,
        handleStartStop,
        clearDebug,
    } = over_under;

    const [showGuide, setShowGuide] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);
    const [strategyOpen, setStrategyOpen] = useState(false);

    const activeStrategy: Strategy = is_differs_mode
        ? 'differs'
        : is_rise_fall_mode
        ? 'rise_fall'
        : is_manual_mode
        ? 'manual'
        : 'over_under';

    const activeStrategyInfo = STRATEGIES.find(s => s.value === activeStrategy)!;

    const selectStrategy = (s: Strategy) => {
        if (is_auto_running || is_authorizing) return;
        setIsDiffersMode(s === 'differs');
        setIsRiseFallMode(s === 'rise_fall');
        setIsManualMode(s === 'manual');
        setStrategyOpen(false);
    };

    useEffect(() => {
        if (over_under.connection_status === 'Offline') {
            connectWebSocket();
        }
        return () => over_under.dispose();
    }, [connectWebSocket, over_under]);

    const digitStats = useMemo(() => {
        const stats = Array(10).fill(0);
        tick_history.forEach(digit => {
            if (digit >= 0 && digit <= 9) stats[digit]++;
        });
        return stats;
    }, [tick_history]);

    const { maxIdx, minIdx } = useMemo(() => {
        if (tick_history.length === 0) return { maxIdx: -1, minIdx: -1 };
        let maxVal = -1, minVal = Infinity, maxIdx = -1, minIdx = -1;
        digitStats.forEach((val, idx) => {
            if (val > maxVal) { maxVal = val; maxIdx = idx; }
            if (val < minVal) { minVal = val; minIdx = idx; }
        });
        return { maxIdx, minIdx };
    }, [digitStats]);

    const totalTicksCount = tick_history.length || 1;

    const volatilityIndices = [
        { text: 'Volatility 100 Index', value: 'R_100' },
        { text: 'Volatility 75 Index', value: 'R_75' },
        { text: 'Volatility 50 Index', value: 'R_50' },
        { text: 'Volatility 25 Index', value: 'R_25' },
        { text: 'Volatility 10 Index', value: 'R_10' },
        { text: 'Volatility 100 (1s) Index', value: '1HZ100V' },
        { text: 'Volatility 75 (1s) Index', value: '1HZ75V' },
        { text: 'Volatility 50 (1s) Index', value: '1HZ50V' },
        { text: 'Volatility 25 (1s) Index', value: '1HZ25V' },
        { text: 'Volatility 10 (1s) Index', value: '1HZ10V' },
    ];

    const getStatusInfo = () => {
        if (is_authorizing)
            return { text: 'Authorizing...', class: 'authorizing', icon: <Activity className='animate-pulse' size={14} /> };
        switch (connection_status) {
            case 'Account Connected':
                return { text: 'Connected', class: 'connected', icon: <CheckCircle2 size={14} /> };
            case 'Live Ticks':
                return { text: 'Live Ticks', class: 'authorizing', icon: <Activity className='animate-pulse' size={14} /> };
            default:
                return { text: connection_status, class: 'disconnected', icon: <AlertCircle size={14} /> };
        }
    };

    const statusInfo = getStatusInfo();

    const startButtonText = useMemo(() => {
        if (is_authorizing) return 'AUTHORIZING...';
        if (is_auto_running) {
            if (is_analyzing_volatility) {
                const name = volatilityIndices.find(v => v.value === current_analyzing_symbol)?.text || current_analyzing_symbol;
                return `ANALYZING: ${name}`;
            }
            return 'STOP';
        }
        return 'START';
    }, [is_auto_running, is_analyzing_volatility, current_analyzing_symbol, is_authorizing]);

    const itemVariants = {
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    };

    return (
        <motion.div
            className='over-under-container'
            initial='hidden'
            animate='visible'
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } }}
        >
            {/* Floating Guide Button */}
            <button className='floating-guide-btn' onClick={() => setShowGuide(true)}>
                <Info size={20} />
                <span>GUIDE</span>
            </button>

            {/* Guide Modal */}
            <AnimatePresence>
                {showGuide && (
                    <motion.div
                        className='guide-modal-overlay'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowGuide(false)}
                    >
                        <motion.div
                            className='guide-modal-content'
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button className='guide-close-btn' onClick={() => setShowGuide(false)}>×</button>
                            <h2><Info size={20} style={{ marginRight: 8 }} /> Over/Under Tool Guide</h2>
                            <div className='guide-scroll-area'>
                                <div className='guide-section'>
                                    <h3><Layers size={16} /> Market Settings</h3>
                                    <ul>
                                        <li><strong>Index:</strong> The volatility market you want to trade on. You can pick any of the 10 available volatility indices.</li>
                                        <li><strong>Volatility Changer:</strong> When ON, the bot scans all 10 indices before each run and automatically picks the one with the best current statistical score.</li>
                                    </ul>
                                </div>
                                <div className='guide-section'>
                                    <h3><Target size={16} /> Strategy: Over 5 / Under 4</h3>
                                    <ul>
                                        <li><strong>How it works:</strong> Waits for the last digit of incoming ticks to match your Trigger Digit, then simultaneously places both an OVER 5 and UNDER 4 contract.</li>
                                        <li><strong>Trigger Digits:</strong> Set one or two digits that must appear (in sequence) to trigger the trade. The LED indicator lights up when the current tick matches.</li>
                                        <li><strong>2ND Trigger:</strong> When ON, the bot requires two consecutive matching digits before firing (e.g. last digit was 7 then 7 again).</li>
                                        <li><strong>Turbo Mode:</strong> The bot keeps running continuously after each round without stopping, waiting for the next trigger immediately.</li>
                                    </ul>
                                </div>
                                <div className='guide-section'>
                                    <h3><Activity size={16} /> Strategy: Differs (Pushback)</h3>
                                    <ul>
                                        <li><strong>How it works:</strong> Watches raw price movement and looks for an "Exaggerated Pushback" — 3 or more consecutive ticks all moving in the same direction (a surge), followed by a tick that snaps back the other way (the rejection). When that reversal tick lands, the bot places a Digit Differs contract using that tick's last digit as the barrier.</li>
                                        <li><strong>Pattern required:</strong> The surge must be clean — no mixed directions allowed in the run-up. The check is done fresh on every tick directly from price history, so it cannot fire on stale data.</li>
                                        <li><strong>2-Term Compound:</strong> When ON, any profit from a winning Differs trade is added on top of the next trade's stake, letting winnings compound.</li>
                                        <li><strong>Auto Cycle:</strong> Automatically restarts the analysis cycle after each round completes.</li>
                                    </ul>
                                </div>
                                <div className='guide-section'>
                                    <h3><TrendingUp size={16} /> Strategy: Rise / Fall</h3>
                                    <ul>
                                        <li><strong>How it works:</strong> Uses MACD-based trend detection on the live tick stream to identify bullish or bearish momentum, then places a Rise or Fall contract accordingly.</li>
                                        <li><strong>Auto Cycle:</strong> Keeps the strategy running continuously, re-evaluating the trend after each settled trade.</li>
                                    </ul>
                                </div>
                                <div className='guide-section'>
                                    <h3><Settings size={16} /> Strategy: Manual</h3>
                                    <ul>
                                        <li><strong>How it works:</strong> You choose the exact contract type (Over, Under, or Differs) and the barrier digit. The bot waits for your trigger digit(s) before placing the trade.</li>
                                        <li><strong>Trigger Digits:</strong> Same as Over/Under — a LED indicator shows when the trigger fires.</li>
                                    </ul>
                                </div>
                                <div className='guide-section'>
                                    <h3><BarChart2 size={16} /> Stake & Risk</h3>
                                    <ul>
                                        <li><strong>Stake:</strong> Your base trade amount per contract.</li>
                                        <li><strong>Martingale:</strong> Multiplier applied to the stake after a loss to recover. Set to 1 to disable.</li>
                                        <li><strong>Turbo Mode:</strong> (Over/Under strategy) Keeps the bot running without pause between rounds.</li>
                                    </ul>
                                </div>
                                <div className='guide-section'>
                                    <h3><ShieldCheck size={16} /> Recovery System</h3>
                                    <ul>
                                        <li><strong>Recovery Active:</strong> Automatically triggers after a losing round. The bot switches to your configured Recovery Type and Barrier to try to win back the loss.</li>
                                        <li><strong>Recovery Type / Barrier:</strong> The contract type (Over, Under, Differs) and digit barrier used during recovery.</li>
                                        <li><strong>Recovery Delay:</strong> When ON, the bot waits for your trigger digit before placing recovery trades (adds a safety gate).</li>
                                        <li><strong>Recovery Goal:</strong> The bot keeps trading with Martingale stake until the total lost amount is fully recovered, then resets back to your original stake automatically.</li>
                                    </ul>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Digit Stats Bar */}
            <motion.div className='stats-grid' variants={itemVariants}>
                {digitStats.map((count, i) => {
                    const percentage = ((count / totalTicksCount) * 100).toFixed(1);
                    const isHot = i === maxIdx && count > 0;
                    const isCold = i === minIdx && count > 0;
                    const barClass = isHot ? 'hot' : isCold ? 'cold' : '';
                    return (
                        <motion.div
                            key={i}
                            className={`digit-card ${last_digit === i ? 'active' : ''} ${barClass}`}
                            whileHover={{ y: -4 }}
                        >
                            <span className='digit-num'>{i}</span>
                            <span className='digit-percent'>{percentage}%</span>
                            <div className='digit-bar-wrapper'>
                                <div className={`digit-bar-fill ${barClass}`} style={{ height: `${percentage}%` }} />
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Main Layout */}
            <div className='main-layout'>
                <motion.div className='controls-panel' variants={itemVariants}>

                    {/* Panel Header */}
                    <div className='panel-header'>
                        <div className='header-title'>
                            <Cpu size={18} />
                            <span>Trading Configuration</span>
                        </div>
                        <div className={`connection-badge ${statusInfo.class}`}>
                            {statusInfo.icon}
                            <span>{statusInfo.text}</span>
                        </div>
                    </div>

                    {/* ── SECTION 1: Market ── */}
                    <div className='config-section'>
                        <div className='section-label'>
                            <BarChart2 size={14} />
                            <span>Market</span>
                        </div>
                        <div className='section-body'>
                            <div className='field-row'>
                                <div className='field-group'>
                                    <label>Index</label>
                                    <select
                                        className='modern-select'
                                        value={selected_symbol}
                                        onChange={e => setSelectedSymbol(e.target.value)}
                                        disabled={is_auto_running || is_authorizing}
                                    >
                                        {volatilityIndices.map(idx => (
                                            <option key={idx.value} value={idx.value}>{idx.text}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className='field-group field-group--narrow'>
                                    <label>Volatility Changer</label>
                                    <button
                                        className={`modern-switch ${is_volatility_changer ? 'active' : ''}`}
                                        onClick={() => setIsVolatilityChanger(!is_volatility_changer)}
                                        disabled={is_auto_running || is_authorizing}
                                    >
                                        <div className='switch-handle' />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── SECTION 2: Strategy ── */}
                    <div className='config-section'>
                        <div className='section-label'>
                            <Layers size={14} />
                            <span>Strategy</span>
                        </div>
                        <div className='section-body'>
                            {/* Strategy Dropdown */}
                            <div className='strategy-picker'>
                                <button
                                    className={`strategy-selected ${is_auto_running || is_authorizing ? 'disabled' : ''}`}
                                    onClick={() => !is_auto_running && !is_authorizing && setStrategyOpen(!strategyOpen)}
                                >
                                    <div className='strategy-selected__left'>
                                        <span className='strategy-icon' style={{ color: activeStrategyInfo.color }}>
                                            {activeStrategyInfo.icon}
                                        </span>
                                        <div>
                                            <span className='strategy-name'>{activeStrategyInfo.label}</span>
                                            <span className='strategy-desc'>{activeStrategyInfo.description}</span>
                                        </div>
                                    </div>
                                    <ChevronDown size={16} className={`strategy-chevron ${strategyOpen ? 'open' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {strategyOpen && (
                                        <motion.div
                                            className='strategy-dropdown'
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            {STRATEGIES.map(s => (
                                                <button
                                                    key={s.value}
                                                    className={`strategy-option ${activeStrategy === s.value ? 'active' : ''}`}
                                                    onClick={() => selectStrategy(s.value)}
                                                    style={{ '--strategy-color': s.color } as React.CSSProperties}
                                                >
                                                    <span className='strategy-option__icon'>{s.icon}</span>
                                                    <div>
                                                        <span className='strategy-option__name'>{s.label}</span>
                                                        <span className='strategy-option__desc'>{s.description}</span>
                                                    </div>
                                                    {activeStrategy === s.value && <CheckCircle2 size={14} className='strategy-option__check' />}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Strategy-specific fields */}
                            <AnimatePresence mode='wait'>
                                {/* Over 5 / Under 4 fields */}
                                {activeStrategy === 'over_under' && (
                                    <motion.div
                                        key='over_under'
                                        className='strategy-fields'
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className='field-row'>
                                            <div className='field-group'>
                                                <label>Trigger Digit</label>
                                                <div className='trigger-container'>
                                                    <div className='digit-input-wrapper'>
                                                        <input
                                                            className='digit-input'
                                                            type='number'
                                                            min='0'
                                                            max='9'
                                                            value={entry_digit}
                                                            onChange={e => setEntryDigit(Number(e.target.value))}
                                                            disabled={is_auto_running || is_authorizing}
                                                        />
                                                        <div className={`led-indicator ${over_under.last_digit === Number(entry_digit) ? 'active' : ''}`} />
                                                    </div>
                                                    {use_second_trigger && (
                                                        <div className='digit-input-wrapper'>
                                                            <input
                                                                className='digit-input'
                                                                type='number'
                                                                min='0'
                                                                max='9'
                                                                value={second_entry_digit}
                                                                onChange={e => setSecondEntryDigit(Number(e.target.value))}
                                                                disabled={is_auto_running || is_authorizing}
                                                            />
                                                            <div className={`led-indicator ${over_under.last_last_digit === Number(entry_digit) && over_under.last_digit === Number(second_entry_digit) ? 'active' : ''}`} />
                                                        </div>
                                                    )}
                                                    <button
                                                        className={`toggle-btn mini ${use_second_trigger ? 'active' : ''}`}
                                                        onClick={() => setUseSecondTrigger(!use_second_trigger)}
                                                        disabled={is_auto_running || is_authorizing}
                                                    >
                                                        2ND
                                                    </button>
                                                </div>
                                            </div>
                                            <div className='field-group field-group--narrow'>
                                                <label>Turbo Mode</label>
                                                <button
                                                    className={`modern-switch ${is_turbo ? 'active' : ''}`}
                                                    onClick={() => setIsTurbo(!is_turbo)}
                                                    disabled={is_auto_running || is_authorizing}
                                                >
                                                    <div className='switch-handle' />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Differs fields */}
                                {activeStrategy === 'differs' && (
                                    <motion.div
                                        key='differs'
                                        className='strategy-fields'
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className='strategy-info-banner' style={{ '--banner-color': '#6f42c1' } as React.CSSProperties}>
                                            <Activity size={14} />
                                            <span>Waits for a clean 3+ tick surge then trades the reversal digit</span>
                                        </div>
                                        <div className='field-row'>
                                            <div className='field-group field-group--narrow'>
                                                <label>2-Term Compound</label>
                                                <button
                                                    className={`modern-switch ${is_2term_mode ? 'active' : ''}`}
                                                    onClick={() => setIs2termMode(!is_2term_mode)}
                                                    disabled={is_auto_running || is_authorizing}
                                                >
                                                    <div className='switch-handle' />
                                                </button>
                                            </div>
                                            <div className='field-group field-group--narrow'>
                                                <label>Auto Cycle</label>
                                                <button
                                                    className={`modern-switch ${is_automate ? 'active' : ''}`}
                                                    onClick={() => setIsAutomate(!is_automate)}
                                                    disabled={is_auto_running || is_authorizing}
                                                >
                                                    <div className='switch-handle' />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Rise/Fall fields */}
                                {activeStrategy === 'rise_fall' && (
                                    <motion.div
                                        key='rise_fall'
                                        className='strategy-fields'
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className='strategy-info-banner' style={{ '--banner-color': '#20c997' } as React.CSSProperties}>
                                            <TrendingUp size={14} />
                                            <span>Uses MACD trend analysis to determine Rise or Fall direction</span>
                                        </div>
                                        <div className='field-row'>
                                            <div className='field-group field-group--narrow'>
                                                <label>Auto Cycle</label>
                                                <button
                                                    className={`modern-switch ${is_automate ? 'active' : ''}`}
                                                    onClick={() => setIsAutomate(!is_automate)}
                                                    disabled={is_auto_running || is_authorizing}
                                                >
                                                    <div className='switch-handle' />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Manual fields */}
                                {activeStrategy === 'manual' && (
                                    <motion.div
                                        key='manual'
                                        className='strategy-fields'
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className='field-row'>
                                            <div className='field-group'>
                                                <label>Contract Type</label>
                                                <select
                                                    className='modern-select'
                                                    value={manual_contract_type}
                                                    onChange={e => setManualContractType(e.target.value)}
                                                    disabled={is_auto_running || is_authorizing}
                                                >
                                                    <option value='DIGITOVER'>Over</option>
                                                    <option value='DIGITUNDER'>Under</option>
                                                    <option value='DIGITDIFF'>Differs</option>
                                                </select>
                                            </div>
                                            <div className='field-group'>
                                                <label>Barrier Digit</label>
                                                <input
                                                    className='modern-input'
                                                    type='number'
                                                    min='0'
                                                    max='9'
                                                    value={manual_barrier}
                                                    onChange={e => setManualBarrier(e.target.value)}
                                                    disabled={is_auto_running || is_authorizing}
                                                />
                                            </div>
                                        </div>
                                        <div className='field-row'>
                                            <div className='field-group'>
                                                <label>Trigger Digit</label>
                                                <div className='trigger-container'>
                                                    <div className='digit-input-wrapper'>
                                                        <input
                                                            className='digit-input'
                                                            type='number'
                                                            min='0'
                                                            max='9'
                                                            value={entry_digit}
                                                            onChange={e => setEntryDigit(Number(e.target.value))}
                                                            disabled={is_auto_running || is_authorizing}
                                                        />
                                                        <div className={`led-indicator ${over_under.last_digit === Number(entry_digit) ? 'active' : ''}`} />
                                                    </div>
                                                    {use_second_trigger && (
                                                        <div className='digit-input-wrapper'>
                                                            <input
                                                                className='digit-input'
                                                                type='number'
                                                                min='0'
                                                                max='9'
                                                                value={second_entry_digit}
                                                                onChange={e => setSecondEntryDigit(Number(e.target.value))}
                                                                disabled={is_auto_running || is_authorizing}
                                                            />
                                                            <div className={`led-indicator ${over_under.last_last_digit === Number(entry_digit) && over_under.last_digit === Number(second_entry_digit) ? 'active' : ''}`} />
                                                        </div>
                                                    )}
                                                    <button
                                                        className={`toggle-btn mini ${use_second_trigger ? 'active' : ''}`}
                                                        onClick={() => setUseSecondTrigger(!use_second_trigger)}
                                                        disabled={is_auto_running || is_authorizing}
                                                    >
                                                        2ND
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* ── SECTION 3: Stake & Risk ── */}
                    <div className='config-section'>
                        <div className='section-label'>
                            <BarChart2 size={14} />
                            <span>Stake & Risk</span>
                        </div>
                        <div className='section-body'>
                            <div className='field-row'>
                                <div className='field-group'>
                                    <label>Stake ($)</label>
                                    <input
                                        className='modern-input'
                                        type='number'
                                        value={stake}
                                        onChange={e => setStake(Number(e.target.value))}
                                        disabled={is_auto_running || is_authorizing}
                                    />
                                </div>
                                <div className='field-group'>
                                    <label>Martingale ×</label>
                                    <input
                                        className='modern-input'
                                        type='number'
                                        step='0.1'
                                        value={martingale}
                                        onChange={e => setMartingale(Number(e.target.value))}
                                        disabled={is_auto_running || is_authorizing}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── SECTION 4: Recovery (collapsible) ── */}
                    <div className='config-section config-section--collapsible'>
                        <button className='section-toggle' onClick={() => setShowRecovery(!showRecovery)}>
                            <div className='section-label'>
                                <ShieldCheck size={14} />
                                <span>Recovery System</span>
                            </div>
                            {showRecovery ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <AnimatePresence>
                            {showRecovery && (
                                <motion.div
                                    className='section-body'
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className='field-row'>
                                        <div className='field-group'>
                                            <label>Recovery Type</label>
                                            <select
                                                className='modern-select'
                                                value={recovery_contract_type}
                                                onChange={e => setRecoveryContractType(e.target.value)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <option value='DIGITOVER'>Over</option>
                                                <option value='DIGITUNDER'>Under</option>
                                                <option value='DIGITDIFF'>Differs</option>
                                            </select>
                                        </div>
                                        <div className='field-group'>
                                            <label>Recovery Barrier</label>
                                            <input
                                                className='modern-input'
                                                type='number'
                                                min='0'
                                                max='9'
                                                value={recovery_barrier}
                                                onChange={e => setRecoveryBarrier(e.target.value)}
                                                disabled={is_auto_running || is_authorizing}
                                            />
                                        </div>
                                        <div className='field-group field-group--narrow'>
                                            <label>Trigger Wait</label>
                                            <button
                                                className={`modern-switch ${use_recovery_delay ? 'active' : ''}`}
                                                onClick={() => setUseRecoveryDelay(!use_recovery_delay)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Start/Stop ── */}
                    <div className='action-bar'>
                        <motion.button
                            className={`main-action-btn ${is_auto_running ? 'stop' : 'start'}`}
                            onClick={handleStartStop}
                            disabled={is_authorizing}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {is_auto_running ? <Square size={18} /> : <Play size={18} />}
                            <span>{startButtonText}</span>
                        </motion.button>
                    </div>
                </motion.div>

                {/* Monitor Panel */}
                <motion.div className='monitor-panel' variants={itemVariants}>
                    <div className='panel-header'>
                        <div className='header-title'>
                            <Terminal size={18} />
                            <span>Real-Time Monitor</span>
                        </div>
                        <button className='icon-btn' onClick={clearDebug} title='Clear logs'>
                            <Trash2 size={15} />
                        </button>
                    </div>
                    <div className='monitor-content'>
                        {debug_info.length === 0 ? (
                            <div className='empty-state'>
                                <Zap size={36} />
                                <p>Waiting for market activity...</p>
                            </div>
                        ) : (
                            <div className='log-list'>
                                {debug_info.map((log, i) => (
                                    <div key={i} className='log-item'>
                                        <span className='log-text'>{log}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
});

export default OverUnder;
