
function calcEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calcMACDHistogram(prices: number[]): number[] {
    if (prices.length < 35) return [];
    const ema12 = calcEMA(prices, 12);
    const ema26 = calcEMA(prices, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]).slice(25);
    const signal = calcEMA(macdLine, 9);
    return macdLine.map((v, i) => v - signal[i]);
}

self.onmessage = (event) => {
    const { ticks, prices, contract_type, barrier, strategy } = event.data;

    const calculateScore = (): number => {
        if (!ticks || ticks.length < 30) return Infinity;

        // ── DIFFERS V2 ─────────────────────────────────────────────────────────────
        // Find volatility that favors prediction engine - good pattern diversity
        // Lower repetition rate = better for prediction engine to find patterns
        if (strategy === 'differs_v2') {
            const n = ticks.length;
            let repeat_1 = 0;
            let repeat_2 = 0;
            let repeat_3 = 0;

            for (let i = 1; i < n; i++) if (ticks[i] === ticks[i - 1]) repeat_1++;
            for (let i = 2; i < n; i++) if (ticks[i] === ticks[i - 2]) repeat_2++;
            for (let i = 3; i < n; i++) if (ticks[i] === ticks[i - 3]) repeat_3++;

            const pct1 = (repeat_1 / (n - 1)) * 100;
            const pct2 = (repeat_2 / (n - 2)) * 100;
            const pct3 = (repeat_3 / (n - 3)) * 100;

            return (pct1 * 2.5) + (pct2 * 2.0) + (pct3 * 1.5);
        }

        // ── DIFFERS ──────────────────────────────────────────────────────────────
        // Find volatility where digits rarely repeat over the last 1000 ticks.
        // A lower repetition rate means better variety for a Differs contract.
        if (strategy === 'differs') {
            const n = ticks.length;
            let repeat_1 = 0; // same digit as immediately prior tick
            let repeat_2 = 0; // same digit as 2 ticks ago
            let repeat_3 = 0; // same digit as 3 ticks ago

            for (let i = 1; i < n; i++) if (ticks[i] === ticks[i - 1]) repeat_1++;
            for (let i = 2; i < n; i++) if (ticks[i] === ticks[i - 2]) repeat_2++;
            for (let i = 3; i < n; i++) if (ticks[i] === ticks[i - 3]) repeat_3++;

            const pct1 = (repeat_1 / (n - 1)) * 100;
            const pct2 = (repeat_2 / (n - 2)) * 100;
            const pct3 = (repeat_3 / (n - 3)) * 100;

            // Lower score = fewer repeats = better for Differs
            return (pct1 * 3.0) + (pct2 * 2.0) + (pct3 * 1.0);
        }

        // ── RISE / FALL ───────────────────────────────────────────────────────────
        // Find volatility whose MACD histograms are mostly tall (strong momentum).
        // A higher average absolute histogram value = stronger trending behaviour.
        if (strategy === 'rise_fall') {
            if (!prices || prices.length < 35) return Infinity;
            const histogram = calcMACDHistogram(prices);
            if (histogram.length === 0) return Infinity;
            const avgAbsHistogram = histogram.reduce((sum, h) => sum + Math.abs(h), 0) / histogram.length;
            return -avgAbsHistogram; // negate — lower score wins; higher avg abs = better
        }

        // ── MANUAL ────────────────────────────────────────────────────────────────
        // Find volatility where losing digits of the chosen contract appear < 10%
        // each across the last 1000 ticks.
        if (strategy === 'manual') {
            const barrier_num = parseInt(barrier, 10);
            let losing_digits: number[] = [];

            if (contract_type === 'DIGITOVER') {
                // DIGITOVER X wins if last digit > X — losing digits are 0..X
                for (let i = 0; i <= barrier_num; i++) losing_digits.push(i);
            } else if (contract_type === 'DIGITUNDER') {
                // DIGITUNDER X wins if last digit < X — losing digits are X..9
                for (let i = barrier_num; i <= 9; i++) losing_digits.push(i);
            } else if (contract_type === 'DIGITDIFF') {
                // Differs loses only when last digit equals the barrier
                losing_digits = [barrier_num];
            }

            if (losing_digits.length === 0) return Infinity;

            const n = ticks.length;
            const maxPct = Math.max(
                ...losing_digits.map(d => (ticks.filter((t: number) => t === d).length / n) * 100)
            );
            // Penalise heavily when any losing digit exceeds 10%
            return maxPct + Math.max(0, maxPct - 10) * 5;
        }

        // ── OVER 5 / UNDER 4 (default) ────────────────────────────────────────────
        // Digits 4 and 5 cause both contracts to lose simultaneously.
        // Find volatility where digits 4 and 5 each appear < 10% of the time.
        {
            const n = ticks.length;
            const pct4 = (ticks.filter((d: number) => d === 4).length / n) * 100;
            const pct5 = (ticks.filter((d: number) => d === 5).length / n) * 100;
            // Lower combined frequency = better; extra penalty above 10%
            return (pct4 + pct5) + Math.max(0, pct4 - 10) * 5 + Math.max(0, pct5 - 10) * 5;
        }
    };

    const score = calculateScore();
    self.postMessage({ score });
};
