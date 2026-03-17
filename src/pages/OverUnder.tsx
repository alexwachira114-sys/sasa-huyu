import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Play, Square, Activity, TrendingUp, ShieldCheck, Zap,
    Info, ChevronDown, ChevronUp, Terminal, Trash2,
    BarChart2, Settings, Layers, Cpu,
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import './over-under.scss';

type Strategy = 'over_under' | 'differs' | 'rise_fall' | 'manual';

const STRATEGIES = [
    {
        value: 'over_under' as Strategy,
        label: 'Over 5 / Under 4',
        short: 'O5/U4',
        icon: <Zap size={15} />,
        color: '#3b82f6',
        glow: 'rgba(59,130,246,0.3)',
    },
    {
        value: 'differs' as Strategy,
        label: 'Differs',
        short: 'DIFF',
        icon: <Activity size={15} />,
        color: '#a855f7',
        glow: 'rgba(168,85,247,0.3)',
    },
    {
        value: 'rise_fall' as Strategy,
        label: 'Rise / Fall',
        short: 'R/F',
        icon: <TrendingUp size={15} />,
        color: '#10b981',
        glow: 'rgba(16,185,129,0.3)',
    },
    {
        value: 'manual' as Strategy,
        label: 'Manual',
        short: 'MAN',
        icon: <Settings size={15} />,
        color: '#f97316',
        glow: 'rgba(249,115,22,0.3)',
    },
] as const;

const OverUnder = observer(() => {
    const { over_under } = useStore();
    const {
        connection_status, tick_history, last_digit, is_auto_running,
        stake, martingale, is_volatility_changer, is_differs_mode,
        is_2term_mode, is_rise_fall_mode, is_automate, use_second_trigger,
        is_manual_mode, manual_contract_type, manual_barrier,
        recovery_contract_type, recovery_barrier, use_recovery_delay,
        entry_digit, second_entry_digit, is_turbo, selected_symbol,
        debug_info, is_analyzing_volatility, current_analyzing_symbol,
        is_authorizing,
        setStake, setMartingale, setIsVolatilityChanger, setIsDiffersMode,
        setIs2termMode, setIsRiseFallMode, setIsAutomate, setUseSecondTrigger,
        setIsManualMode, setManualContractType, setManualBarrier,
        setRecoveryContractType, setRecoveryBarrier, setUseRecoveryDelay,
        setEntryDigit, setSecondEntryDigit, setIsTurbo, setSelectedSymbol,
        connectWebSocket, handleStartStop, clearDebug,
    } = over_under;

    const [showGuide, setShowGuide] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);

    const activeStrategy: Strategy = is_differs_mode ? 'differs'
        : is_rise_fall_mode ? 'rise_fall'
        : is_manual_mode ? 'manual'
        : 'over_under';

    const activeMeta = STRATEGIES.find(s => s.value === activeStrategy)!;

    const selectStrategy = (s: Strategy) => {
        if (is_auto_running || is_authorizing) return;
        setIsDiffersMode(s === 'differs');
        setIsRiseFallMode(s === 'rise_fall');
        setIsManualMode(s === 'manual');
    };

    useEffect(() => {
        if (over_under.connection_status === 'Offline') connectWebSocket();
        return () => over_under.dispose();
    }, [connectWebSocket, over_under]);

    const digitStats = useMemo(() => {
        const stats = Array(10).fill(0);
        tick_history.forEach(d => { if (d >= 0 && d <= 9) stats[d]++; });
        return stats;
    }, [tick_history]);

    const { maxIdx, minIdx } = useMemo(() => {
        if (!tick_history.length) return { maxIdx: -1, minIdx: -1 };
        let maxVal = -1, minVal = Infinity, maxIdx = -1, minIdx = -1;
        digitStats.forEach((v, i) => {
            if (v > maxVal) { maxVal = v; maxIdx = i; }
            if (v < minVal) { minVal = v; minIdx = i; }
        });
        return { maxIdx, minIdx };
    }, [digitStats, tick_history.length]);

    const totalTicks = tick_history.length || 1;

    const volatilityIndices = [
        { text: 'V 100', value: 'R_100' }, { text: 'V 75', value: 'R_75' },
        { text: 'V 50', value: 'R_50' }, { text: 'V 25', value: 'R_25' },
        { text: 'V 10', value: 'R_10' },
        { text: 'V 100 (1s)', value: '1HZ100V' }, { text: 'V 75 (1s)', value: '1HZ75V' },
        { text: 'V 50 (1s)', value: '1HZ50V' }, { text: 'V 25 (1s)', value: '1HZ25V' },
        { text: 'V 10 (1s)', value: '1HZ10V' },
    ];

    const volatilityIndicesFull = [
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

    const statusDot = is_authorizing ? 'pulse'
        : connection_status === 'Account Connected' ? 'ok'
        : connection_status === 'Live Ticks' ? 'pulse'
        : 'off';

    const statusLabel = is_authorizing ? 'Authorizing'
        : connection_status === 'Account Connected' ? 'Connected'
        : connection_status === 'Live Ticks' ? 'Live'
        : connection_status || 'Offline';

    const startLabel = useMemo(() => {
        if (is_authorizing) return 'AUTHORIZING…';
        if (is_auto_running) {
            if (is_analyzing_volatility) return 'SCANNING…';
            return 'STOP BOT';
        }
        return 'START BOT';
    }, [is_auto_running, is_analyzing_volatility, is_authorizing]);

    return (
        <div className='ou-root'>
            {/* ── Guide FAB ─────────────────────────────────── */}
            <button className='ou-guide-fab' onClick={() => setShowGuide(true)}>
                <Info size={16} /><span>Guide</span>
            </button>

            {/* ── Guide Modal ───────────────────────────────── */}
            <AnimatePresence>
                {showGuide && (
                    <motion.div className='ou-overlay' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setShowGuide(false)}>
                        <motion.div className='ou-guide' initial={{ opacity: 0, y: 24, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
                            onClick={e => e.stopPropagation()}>
                            <div className='ou-guide__header'>
                                <div className='ou-guide__title'><Info size={18} /> Over/Under Tool — Strategy Guide</div>
                                <button className='ou-guide__close' onClick={() => setShowGuide(false)}>×</button>
                            </div>
                            <div className='ou-guide__body'>
                                <div className='ou-guide__section'>
                                    <h3 className='ou-guide__sh blue'>Market Settings</h3>
                                    <p><strong>Index</strong> — Select which volatility market to trade. Ten indices are available (standard and 1-second tick variants).</p>
                                    <p><strong>Volatility Changer</strong> — When enabled, the bot scans all 10 indices and auto-switches to the one with the best statistical score before trading.</p>
                                </div>
                                <div className='ou-guide__section'>
                                    <h3 className='ou-guide__sh blue'>Over 5 / Under 4</h3>
                                    <p>The bot waits until the live tick's last digit matches your <strong>Trigger Digit</strong>, then simultaneously places both an Over 5 and Under 4 contract.</p>
                                    <p><strong>2ND Trigger</strong> — Require two consecutive matching digits before firing (extra precision).</p>
                                    <p><strong>Turbo Mode</strong> — Available for all strategies. When ON, the bot loops continuously, re-triggering the next trade immediately after each settled round without any pause.</p>
                                </div>
                                <div className='ou-guide__section'>
                                    <h3 className='ou-guide__sh purple'>Differs (Pushback)</h3>
                                    <p>Watches raw price movement for the <em>Exaggerated Pushback</em> pattern: <strong>3 or more consecutive ticks in one direction</strong>, followed by a tick that snaps back the opposite way. When that reversal lands, the bot places a <strong>Digit Differs</strong> contract using the reversal tick's last digit.</p>
                                    <p>The check is done fresh on every tick by reading the real price history — no stale counters, no false fires on mixed directions.</p>
                                    <p><strong>2-Term Compound</strong> — Adds winning profit on top of the next stake for compounding growth.</p>
                                    <p><strong>Auto Cycle</strong> — Restarts automatically after each completed round.</p>
                                </div>
                                <div className='ou-guide__section'>
                                    <h3 className='ou-guide__sh green'>Rise / Fall</h3>
                                    <p>Uses MACD-based trend detection on the live tick stream. Identifies bullish or bearish momentum and places a Rise or Fall contract accordingly.</p>
                                    <p><strong>Auto Cycle</strong> — Continuously re-evaluates the trend after each trade settles.</p>
                                </div>
                                <div className='ou-guide__section'>
                                    <h3 className='ou-guide__sh orange'>Manual</h3>
                                    <p>You choose the exact <strong>Contract Type</strong> (Over, Under, or Differs) and the <strong>Barrier Digit</strong>. The bot waits for your Trigger Digit before placing the trade.</p>
                                </div>
                                <div className='ou-guide__section'>
                                    <h3 className='ou-guide__sh red'>Recovery System</h3>
                                    <p>After a losing round, the bot automatically switches to your <strong>Recovery Type</strong> and <strong>Barrier</strong> with a Martingale-multiplied stake until the full loss is recovered, then resets.</p>
                                    <p><strong>Trigger Wait</strong> — Forces the bot to wait for your trigger digit before placing recovery trades.</p>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Digit Heatmap ─────────────────────────────── */}
            <div className='ou-heatmap'>
                {digitStats.map((count, i) => {
                    const pct = ((count / totalTicks) * 100);
                    const isHot = i === maxIdx && count > 0;
                    const isCold = i === minIdx && count > 0;
                    const isActive = last_digit === i;
                    return (
                        <motion.div key={i} className={`ou-digit ${isActive ? 'active' : ''} ${isHot ? 'hot' : isCold ? 'cold' : ''}`}
                            whileHover={{ y: -3 }}>
                            <div className='ou-digit__num'>{i}</div>
                            <div className='ou-digit__bar'>
                                <motion.div className='ou-digit__fill'
                                    animate={{ height: `${pct}%` }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    style={{
                                        background: isHot ? '#10b981' : isCold ? '#ef4444' : '#3b82f6',
                                    }} />
                            </div>
                            <div className='ou-digit__pct'>{pct.toFixed(0)}%</div>
                        </motion.div>
                    );
                })}
            </div>

            {/* ── Main Grid ─────────────────────────────────── */}
            <div className='ou-grid'>

                {/* ═══ LEFT — Config Panel ═══ */}
                <div className='ou-panel'>

                    {/* Panel top bar */}
                    <div className='ou-panel__bar'>
                        <div className='ou-panel__bar-left'>
                            <Cpu size={15} />
                            <span>Configuration</span>
                        </div>
                        <div className={`ou-status ou-status--${statusDot}`}>
                            <span className='ou-status__dot' />
                            <span>{statusLabel}</span>
                        </div>
                    </div>

                    {/* ── Market ───────────────────────────── */}
                    <div className='ou-block'>
                        <div className='ou-block__label'><BarChart2 size={12} /> Market</div>
                        <div className='ou-row'>
                            <div className='ou-field'>
                                <label>Index</label>
                                <select className='ou-select' value={selected_symbol}
                                    onChange={e => setSelectedSymbol(e.target.value)}
                                    disabled={is_auto_running || is_authorizing}>
                                    {volatilityIndicesFull.map(v => (
                                        <option key={v.value} value={v.value}>{v.text}</option>
                                    ))}
                                </select>
                            </div>
                            <div className='ou-field ou-field--auto'>
                                <label>Volatility Changer</label>
                                <div className='ou-row ou-row--center'>
                                    <button className={`ou-toggle ${is_volatility_changer ? 'on' : ''}`}
                                        onClick={() => setIsVolatilityChanger(!is_volatility_changer)}
                                        disabled={is_auto_running || is_authorizing}>
                                        <span />
                                    </button>
                                    <span className={`ou-toggle-label ${is_volatility_changer ? 'on' : ''}`}>
                                        {is_volatility_changer ? 'ON' : 'OFF'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Strategy Selector ────────────────── */}
                    <div className='ou-block'>
                        <div className='ou-block__label'><Layers size={12} /> Strategy</div>
                        <div className='ou-strategy-tabs'>
                            {STRATEGIES.map(s => (
                                <button
                                    key={s.value}
                                    className={`ou-strat-tab ${activeStrategy === s.value ? 'active' : ''}`}
                                    style={activeStrategy === s.value ? {
                                        '--sc': s.color, '--sg': s.glow,
                                    } as React.CSSProperties : {}}
                                    onClick={() => selectStrategy(s.value)}
                                    disabled={is_auto_running || is_authorizing}
                                >
                                    <span className='ou-strat-tab__icon'>{s.icon}</span>
                                    <span className='ou-strat-tab__label'>{s.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Strategy description pill */}
                        <div className='ou-strat-badge' style={{ '--sc': activeMeta.color } as React.CSSProperties}>
                            <span className='ou-strat-badge__dot' />
                            {activeStrategy === 'over_under' && 'Fires Over 5 & Under 4 on trigger digit match'}
                            {activeStrategy === 'differs' && 'Trades reversal digit after a clean 3+ tick surge'}
                            {activeStrategy === 'rise_fall' && 'MACD trend analysis — places Rise or Fall contracts'}
                            {activeStrategy === 'manual' && 'You control the contract type, barrier, and trigger'}
                        </div>

                        {/* Strategy-specific options */}
                        <AnimatePresence mode='wait'>
                            <motion.div key={activeStrategy}
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>

                                {/* Over 5 / Under 4 */}
                                {activeStrategy === 'over_under' && (
                                    <div className='ou-strat-fields'>
                                        <div className='ou-row'>
                                            <div className='ou-field'>
                                                <label>Trigger Digit</label>
                                                <div className='ou-trigger-row'>
                                                    <div className='ou-digit-box'>
                                                        <input type='number' min='0' max='9' value={entry_digit}
                                                            onChange={e => setEntryDigit(Number(e.target.value))}
                                                            disabled={is_auto_running || is_authorizing} />
                                                        <span className={`ou-led ${over_under.last_digit === entry_digit ? 'on' : ''}`} />
                                                    </div>
                                                    {use_second_trigger && (
                                                        <div className='ou-digit-box'>
                                                            <input type='number' min='0' max='9' value={second_entry_digit}
                                                                onChange={e => setSecondEntryDigit(Number(e.target.value))}
                                                                disabled={is_auto_running || is_authorizing} />
                                                            <span className={`ou-led ${over_under.last_last_digit === entry_digit && over_under.last_digit === second_entry_digit ? 'on' : ''}`} />
                                                        </div>
                                                    )}
                                                    <button className={`ou-chip ${use_second_trigger ? 'active' : ''}`}
                                                        onClick={() => setUseSecondTrigger(!use_second_trigger)}
                                                        disabled={is_auto_running || is_authorizing}>
                                                        2ND
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Differs */}
                                {activeStrategy === 'differs' && (
                                    <div className='ou-strat-fields'>
                                        <div className='ou-row'>
                                            <div className='ou-field ou-field--auto'>
                                                <label>2-Term Compound</label>
                                                <div className='ou-row ou-row--center'>
                                                    <button className={`ou-toggle ${is_2term_mode ? 'on' : ''}`}
                                                        onClick={() => setIs2termMode(!is_2term_mode)}
                                                        disabled={is_auto_running || is_authorizing}><span /></button>
                                                    <span className={`ou-toggle-label ${is_2term_mode ? 'on' : ''}`}>{is_2term_mode ? 'ON' : 'OFF'}</span>
                                                </div>
                                            </div>
                                            <div className='ou-field ou-field--auto'>
                                                <label>Auto Cycle</label>
                                                <div className='ou-row ou-row--center'>
                                                    <button className={`ou-toggle ${is_automate ? 'on' : ''}`}
                                                        onClick={() => setIsAutomate(!is_automate)}
                                                        disabled={is_auto_running || is_authorizing}><span /></button>
                                                    <span className={`ou-toggle-label ${is_automate ? 'on' : ''}`}>{is_automate ? 'ON' : 'OFF'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Rise / Fall */}
                                {activeStrategy === 'rise_fall' && (
                                    <div className='ou-strat-fields'>
                                        <div className='ou-row'>
                                            <div className='ou-field ou-field--auto'>
                                                <label>Auto Cycle</label>
                                                <div className='ou-row ou-row--center'>
                                                    <button className={`ou-toggle ${is_automate ? 'on' : ''}`}
                                                        onClick={() => setIsAutomate(!is_automate)}
                                                        disabled={is_auto_running || is_authorizing}><span /></button>
                                                    <span className={`ou-toggle-label ${is_automate ? 'on' : ''}`}>{is_automate ? 'ON' : 'OFF'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Manual */}
                                {activeStrategy === 'manual' && (
                                    <div className='ou-strat-fields'>
                                        <div className='ou-row'>
                                            <div className='ou-field'>
                                                <label>Contract Type</label>
                                                <select className='ou-select' value={manual_contract_type}
                                                    onChange={e => setManualContractType(e.target.value)}
                                                    disabled={is_auto_running || is_authorizing}>
                                                    <option value='DIGITOVER'>Over</option>
                                                    <option value='DIGITUNDER'>Under</option>
                                                    <option value='DIGITDIFF'>Differs</option>
                                                </select>
                                            </div>
                                            <div className='ou-field'>
                                                <label>Barrier Digit</label>
                                                <input className='ou-input' type='number' min='0' max='9'
                                                    value={manual_barrier}
                                                    onChange={e => setManualBarrier(e.target.value)}
                                                    disabled={is_auto_running || is_authorizing} />
                                            </div>
                                        </div>
                                        <div className='ou-row'>
                                            <div className='ou-field'>
                                                <label>Trigger Digit</label>
                                                <div className='ou-trigger-row'>
                                                    <div className='ou-digit-box'>
                                                        <input type='number' min='0' max='9' value={entry_digit}
                                                            onChange={e => setEntryDigit(Number(e.target.value))}
                                                            disabled={is_auto_running || is_authorizing} />
                                                        <span className={`ou-led ${over_under.last_digit === entry_digit ? 'on' : ''}`} />
                                                    </div>
                                                    {use_second_trigger && (
                                                        <div className='ou-digit-box'>
                                                            <input type='number' min='0' max='9' value={second_entry_digit}
                                                                onChange={e => setSecondEntryDigit(Number(e.target.value))}
                                                                disabled={is_auto_running || is_authorizing} />
                                                            <span className={`ou-led ${over_under.last_last_digit === entry_digit && over_under.last_digit === second_entry_digit ? 'on' : ''}`} />
                                                        </div>
                                                    )}
                                                    <button className={`ou-chip ${use_second_trigger ? 'active' : ''}`}
                                                        onClick={() => setUseSecondTrigger(!use_second_trigger)}
                                                        disabled={is_auto_running || is_authorizing}>2ND</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* ── Stake & Risk ──────────────────────── */}
                    <div className='ou-block'>
                        <div className='ou-block__label'><BarChart2 size={12} /> Stake & Risk</div>
                        <div className='ou-row'>
                            <div className='ou-field'>
                                <label>Stake ($)</label>
                                <input className='ou-input' type='number' min='0.35' step='0.1' value={stake}
                                    onChange={e => setStake(Number(e.target.value))}
                                    disabled={is_auto_running || is_authorizing} />
                            </div>
                            <div className='ou-field'>
                                <label>Martingale ×</label>
                                <input className='ou-input' type='number' min='1' step='0.1' value={martingale}
                                    onChange={e => setMartingale(Number(e.target.value))}
                                    disabled={is_auto_running || is_authorizing} />
                            </div>
                            <div className='ou-field ou-field--auto'>
                                <label>Turbo Mode</label>
                                <div className='ou-row ou-row--center'>
                                    <button className={`ou-toggle ${is_turbo ? 'on' : ''}`}
                                        onClick={() => setIsTurbo(!is_turbo)}
                                        disabled={is_auto_running || is_authorizing}><span /></button>
                                    <span className={`ou-toggle-label ${is_turbo ? 'on' : ''}`}>{is_turbo ? 'ON' : 'OFF'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Recovery ─────────────────────────── */}
                    <div className='ou-block ou-block--collapsible'>
                        <button className='ou-collapse-btn' onClick={() => setShowRecovery(!showRecovery)}>
                            <span className='ou-block__label' style={{ padding: 0, borderBottom: 'none', marginBottom: 0 }}>
                                <ShieldCheck size={12} /> Recovery System
                            </span>
                            {showRecovery ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <AnimatePresence>
                            {showRecovery && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                    style={{ overflow: 'hidden' }}>
                                    <div className='ou-row' style={{ marginTop: '0.75rem' }}>
                                        <div className='ou-field'>
                                            <label>Recovery Type</label>
                                            <select className='ou-select' value={recovery_contract_type}
                                                onChange={e => setRecoveryContractType(e.target.value)}
                                                disabled={is_auto_running || is_authorizing}>
                                                <option value='DIGITOVER'>Over</option>
                                                <option value='DIGITUNDER'>Under</option>
                                                <option value='DIGITDIFF'>Differs</option>
                                            </select>
                                        </div>
                                        <div className='ou-field'>
                                            <label>Recovery Barrier</label>
                                            <input className='ou-input' type='number' min='0' max='9'
                                                value={recovery_barrier}
                                                onChange={e => setRecoveryBarrier(e.target.value)}
                                                disabled={is_auto_running || is_authorizing} />
                                        </div>
                                        <div className='ou-field ou-field--auto'>
                                            <label>Trigger Wait</label>
                                            <div className='ou-row ou-row--center'>
                                                <button className={`ou-toggle ${use_recovery_delay ? 'on' : ''}`}
                                                    onClick={() => setUseRecoveryDelay(!use_recovery_delay)}
                                                    disabled={is_auto_running || is_authorizing}><span /></button>
                                                <span className={`ou-toggle-label ${use_recovery_delay ? 'on' : ''}`}>{use_recovery_delay ? 'ON' : 'OFF'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Start / Stop ──────────────────────── */}
                    <motion.button
                        className={`ou-cta ${is_auto_running ? 'stop' : 'start'}`}
                        onClick={handleStartStop}
                        disabled={is_authorizing}
                        whileHover={!is_authorizing ? { scale: 1.015 } : {}}
                        whileTap={!is_authorizing ? { scale: 0.985 } : {}}
                        style={{ '--ac': is_auto_running ? '#ef4444' : activeMeta.color, '--ag': is_auto_running ? 'rgba(239,68,68,0.35)' : activeMeta.glow } as React.CSSProperties}
                    >
                        <span className='ou-cta__icon'>
                            {is_auto_running ? <Square size={18} /> : <Play size={18} />}
                        </span>
                        <span className='ou-cta__text'>{startLabel}</span>
                        {is_auto_running && <span className='ou-cta__pulse' />}
                    </motion.button>
                </div>

                {/* ═══ RIGHT — Monitor Panel ═══ */}
                <div className='ou-monitor'>
                    <div className='ou-monitor__bar'>
                        <div className='ou-monitor__title'><Terminal size={14} /> Live Monitor</div>
                        <button className='ou-monitor__clear' onClick={clearDebug} title='Clear'>
                            <Trash2 size={13} />
                        </button>
                    </div>
                    <div className='ou-monitor__body'>
                        {debug_info.length === 0 ? (
                            <div className='ou-monitor__empty'>
                                <Zap size={32} />
                                <span>Waiting for signals…</span>
                            </div>
                        ) : (
                            <div className='ou-monitor__logs'>
                                {debug_info.map((line, i) => {
                                    const isWin = /WON/i.test(line);
                                    const isLoss = /LOST/i.test(line);
                                    const isPattern = /PATTERN/i.test(line);
                                    const cls = isWin ? 'win' : isLoss ? 'loss' : isPattern ? 'pattern' : '';
                                    return (
                                        <div key={i} className={`ou-log ${cls}`}>
                                            <span className='ou-log__bar' />
                                            <span className='ou-log__text'>{line}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default OverUnder;
