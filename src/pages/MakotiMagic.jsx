import React, { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';

const MakotiMagic = observer(() => {
    const { client } = useStore();
    
    const [is_hunting, setIsHunting] = useState(false);
    const [stake, setStake] = useState(0.35);
    const [results, setResults] = useState([]);
    const [total_pl, setTotalPL] = useState(0);
    const [is_auto_mode, setIsAutoMode] = useState(false); // NEW: Auto-Loop

    const hunt_active = useRef(false);

    // RESULTS LISTENER
    useEffect(() => {
        const sub = api_base.api.onMessage().subscribe((msg) => {
            const data = msg.data;
            if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
                const contract = data.proposal_open_contract;
                const profit = contract.profit;

                setResults(prev => [{
                    id: contract.contract_id,
                    stake: contract.buy_price,
                    prediction: contract.barrier,
                    entry: contract.entry_tick_display_value.slice(-1),
                    exit: contract.exit_tick_display_value.slice(-1),
                    status: contract.status.toUpperCase(),
                    profit: profit
                }, ...prev].slice(0, 8));
                setTotalPL(prev => prev + profit);

                // If in auto mode, re-arm the hunter immediately after a result
                if (is_auto_mode) {
                    setTimeout(() => {
                        hunt_active.current = true;
                        setIsHunting(true);
                    }, 100); 
                }
            }
        });
        return () => sub.unsubscribe();
    }, [is_auto_mode]);

    const fireInstantStrike = useCallback((digit) => {
        if (!hunt_active.current) return;

        api_base.api.send({
            buy: 1,
            price: Number(stake),
            parameters: {
                amount: Number(stake),
                basis: 'stake',
                contract_type: 'DIGITMATCH',
                currency: client.currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: '1HZ100V', 
                barrier: parseInt(digit) 
            }
        });

        hunt_active.current = false;
        if (!is_auto_mode) setIsHunting(false);
    }, [stake, client.currency, is_auto_mode]);

    useEffect(() => {
        let tick_sub;
        if (is_hunting) {
            hunt_active.current = true;
            tick_sub = api_base.api.onMessage().subscribe((msg) => {
                if (hunt_active.current && msg.data.msg_type === 'tick') {
                    const digit = msg.data.tick.quote.toString().slice(-1);
                    fireInstantStrike(digit);
                }
            });
        }
        return () => tick_sub?.unsubscribe();
    }, [is_hunting, fireInstantStrike]);

    return (
        <div style={ui.container}>
            <div style={ui.header}>
                <h1 style={{ color: '#0f0', letterSpacing: '2px' }}>MAKOTI AUTO-STRIKE V5</h1>
                <div style={ui.pl}>TOTAL P/L: {total_pl.toFixed(2)}</div>
            </div>

            <div style={ui.card}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '12px', color: '#666' }}>STAKE AMOUNT</label><br/>
                    <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} style={ui.input} />
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setIsHunting(true)} disabled={is_hunting} style={is_hunting ? ui.btnActive : ui.btn}>
                        {is_hunting ? "SCANNING..." : "SINGLE STRIKE"}
                    </button>

                    <button 
                        onClick={() => {
                            setIsAutoMode(!is_auto_mode);
                            setIsHunting(!is_auto_mode);
                        }} 
                        style={{ ...ui.btn, background: is_auto_mode ? '#f00' : '#00ff88' }}
                    >
                        {is_auto_mode ? "STOP AUTO" : "START AUTO-LOOP"}
                    </button>
                </div>
                <p style={{ fontSize: '10px', color: '#444', marginTop: '10px' }}>
                    *Auto-Loop fires a packet every time a new tick gate opens.
                </p>
            </div>

            <div style={ui.tableWrapper}>
                <table style={ui.table}>
                    <thead>
                        <tr style={{ color: '#555', fontSize: '11px' }}>
                            <th>PREDICT</th>
                            <th>ENTRY</th>
                            <th>EXIT</th>
                            <th>STATUS</th>
                            <th>PROFIT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((res, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #111' }}>
                                <td style={{ color: '#ff0' }}>{res.prediction}</td>
                                <td>{res.entry}</td>
                                <td style={{ fontWeight: 'bold' }}>{res.exit}</td>
                                <td style={{ color: res.status === 'WON' ? '#0f0' : '#f00' }}>{res.status}</td>
                                <td style={{ color: res.profit >= 0 ? '#0f0' : '#f00' }}>{res.profit.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

const ui = {
    container: { background: '#000', color: '#0f0', minHeight: '100vh', padding: '15px', fontFamily: 'monospace' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px' },
    pl: { fontSize: '18px', fontWeight: 'bold' },
    card: { background: '#050505', padding: '20px', borderRadius: '4px', textAlign: 'center', margin: '20px 0', border: '1px solid #1a1a1a' },
    input: { background: '#000', color: '#0f0', border: '1px solid #0f0', padding: '8px', width: '80px', textAlign: 'center', marginTop: '5px' },
    btn: { background: '#0f0', color: '#000', padding: '12px 10px', fontSize: '14px', fontWeight: 'bold', border: 'none', cursor: 'pointer', flex: 1 },
    btnActive: { background: '#111', color: '#444', padding: '12px 10px', fontSize: '14px', border: 'none', flex: 1 },
    tableWrapper: { background: '#050505', padding: '10px' },
    table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }
};

export default MakotiMagic;
