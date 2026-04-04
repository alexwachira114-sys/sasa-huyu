
// ═══════════════════════════════════════════════════════════
//  Makoti AI - Advanced Over/Under Analysis Engine v2.7
//  (Edge Analysis Engine)
// ═══════════════════════════════════════════════════════════

// ── Type Definitions ────────────────────────────────────────
export interface AnalysisResult {
    bestEntry: GoldenEntry | null;
    goldenEntries: GoldenEntry[];
}

export interface GoldenEntry {
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    barrier: string;
    duration: number;
    winRate: number;
    edge: number; // The statistical edge provided by the trigger
    analysis: string;
    triggerDigits: number[];
    confidence: number; // A composite score including edge and other factors
    triggerType: 'single';
}

// ── Main Analysis Functions ──────────────────────────────────

const calculateBaselineWinRate = (
    history: number[],
    contractType: 'DIGITOVER' | 'DIGITUNDER',
    barrier: number,
    duration: number
): number => {
    let wins = 0;
    let trades = 0;
    if (history.length <= duration) return 0;
    for (let i = 0; i < history.length - duration; i++) {
        trades++;
        const outcome_tick = history[i + duration -1];
        if (contractType === 'DIGITOVER' && outcome_tick > barrier) {
            wins++;
        } else if (contractType === 'DIGITUNDER' && outcome_tick < barrier) {
            wins++;
        }
    }
    return trades > 0 ? wins / trades : 0;
};

const simulateTriggerTrade = (
    history: number[],
    contractType: 'DIGITOVER' | 'DIGITUNDER',
    barrier: number,
    triggerDigit: number,
    duration: number
): { winRate: number, wins: number, trades: number } => {
    let wins = 0;
    let trades = 0;
    for (let i = 1; i < history.length - duration; i++) {
        if (history[i - 1] === triggerDigit) {
            trades++;
            const outcome_tick = history[i + duration - 1];
            if (contractType === 'DIGITOVER' && outcome_tick > barrier) {
                wins++;
            } else if (contractType === 'DIGITUNDER' && outcome_tick < barrier) {
                wins++;
            }
        }
    }
    return { winRate: trades > 3 ? wins / trades : 0, wins, trades };
};

const calculateMovingAverage = (history: number[], period: number): number => {
    const period_history = history.slice(-period);
    if (period_history.length < period) return 0;
    return period_history.reduce((a, b) => a + b, 0) / period;
};

const calculateDigitDistribution = (history: number[], period: number): number[] => {
    const period_history = history.slice(-period);
    const counts = Array(10).fill(0);
    period_history.forEach(digit => { counts[digit]++; });
    return counts.map(count => (count / period_history.length) * 100);
};


export const analyzeDigits = (history: number[], symbol: string): AnalysisResult => {
    const analysis_period = 200;
    if (history.length < analysis_period) {
        return { bestEntry: null, goldenEntries: [] };
    }

    const recent_history = history.slice(-analysis_period);
    let allPotentialEntries: GoldenEntry[] = [];

    // 1. STRATEGY: Micro-Pattern Simulation (Core Trigger + Duration Analysis)
    const potential_contracts: { type: 'DIGITOVER' | 'DIGITUNDER', barrier: number }[] = [];
    for (let barrier = 0; barrier <= 8; barrier++) potential_contracts.push({ type: 'DIGITOVER', barrier });
    for (let barrier = 1; barrier <= 9; barrier++) potential_contracts.push({ type: 'DIGITUNDER', barrier });
    
    const baselines = new Map<string, number>();

    for (const contract of potential_contracts) {
        for (let triggerDigit = 0; triggerDigit <= 9; triggerDigit++) {
            let best_duration_for_pattern = { duration: 0, winRate: 0, wins: 0, trades: 0 };

            for (let duration = 1; duration <= 5; duration++) {
                const simulation = simulateTriggerTrade(recent_history, contract.type, contract.barrier, triggerDigit, duration);
                if (simulation.winRate > best_duration_for_pattern.winRate) {
                    best_duration_for_pattern = { duration, ...simulation };
                }
            }
            
            if (best_duration_for_pattern.winRate > 0) { 
                const baseline_key = `${contract.type}-${contract.barrier}-${best_duration_for_pattern.duration}`;
                if (!baselines.has(baseline_key)) {
                    const baseline_win_rate = calculateBaselineWinRate(recent_history, contract.type, contract.barrier, best_duration_for_pattern.duration);
                    baselines.set(baseline_key, baseline_win_rate);
                }
                const baseline = baselines.get(baseline_key)!;
                const edge = best_duration_for_pattern.winRate - baseline;

                if (edge > 0.20) { // Only consider patterns that provide at least a 20% edge
                    allPotentialEntries.push({
                        contractType: contract.type,
                        barrier: String(contract.barrier),
                        duration: best_duration_for_pattern.duration,
                        winRate: best_duration_for_pattern.winRate,
                        edge: edge,
                        analysis: ``, // Will be populated later
                        triggerDigits: [triggerDigit],
                        confidence: edge, // Start with edge as the base confidence
                        triggerType: 'single',
                    });
                }
            }
        }
    }

    if (allPotentialEntries.length === 0) {
        return { bestEntry: null, goldenEntries: [{ contractType: 'DIGITOVER', barrier: '4', triggerDigits: [], duration: 5, winRate: 0, edge: 0, confidence: 0, analysis: 'No high-edge trigger patterns found.', triggerType: 'single' }] };
    }

    // 2. Run supplementary analysis strategies to score confidence
    const long_term_history = history.slice(-1000);
    const ma_short = calculateMovingAverage(recent_history, 20);
    const ma_long = calculateMovingAverage(recent_history, 100);
    const distribution = calculateDigitDistribution(long_term_history, 1000);
    const volatility = Math.sqrt(recent_history.map(x => Math.pow(x - ma_short, 2)).reduce((a, b) => a + b) / recent_history.length);

    for (const entry of allPotentialEntries) {
        let confidence_score = entry.edge; // Base score is the statistical edge
        let reasons = [ `Edge: +${(entry.edge * 100).toFixed(0)}%`];

        const is_up_trend = ma_short > ma_long;
        if (entry.contractType === 'DIGITOVER' && is_up_trend) {
            confidence_score *= 1.1; 
            reasons.push('Uptrend');
        } else if (entry.contractType === 'DIGITUNDER' && !is_up_trend) {
            confidence_score *= 1.1; 
            reasons.push('Downtrend');
        }

        const barrier = parseInt(entry.barrier, 10);
        if (entry.contractType === 'DIGITUNDER' && barrier >= 6) {
            const hot_digits = distribution.slice(barrier).reduce((a, b) => a + b, 0);
            if (hot_digits < 30) {
                confidence_score *= 1.15; 
                reasons.push('Cold Digits');
            }
        }
        if (entry.contractType === 'DIGITOVER' && barrier <= 3) {
            const cold_digits = distribution.slice(0, barrier + 1).reduce((a, b) => a + b, 0);
            if (cold_digits < 30) { 
                confidence_score *= 1.15;
                reasons.push('Cold Digits');
            }
        }

        if (volatility < 2.5) { 
            confidence_score *= 1.05;
            reasons.push('Low Volatility');
        }

        entry.confidence = confidence_score;
        entry.analysis = `${entry.contractType.replace('DIGIT','')} ${entry.barrier} on trigger ${entry.triggerDigits[0]} for ${entry.duration}t (Edge: +${(entry.edge * 100).toFixed(0)}%, Win Rate: ${(entry.winRate*100).toFixed(0)}%). Reasons: ${reasons.join(', ')}`;
    }

    // 3. Sort by the final confidence score
    allPotentialEntries.sort((a, b) => b.confidence - a.confidence);

    const bestEntry = allPotentialEntries.length > 0 ? allPotentialEntries[0] : null;
    const goldenEntries = allPotentialEntries.slice(0, 5);

    return { bestEntry, goldenEntries };
};