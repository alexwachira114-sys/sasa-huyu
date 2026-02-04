import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';

const MakotiMagic = observer(() => {
    // Trading States
    const [token, setToken] = useState('');
    const [stake, setStake] = useState(0.35);
    const [offset, setOffset] = useState(15);
    const [currency, setCurrency] = useState('USD');
    
    // UI States
    const [is_hunting, setIsHunting] = useState(false);
    const [results, setResults] = useState([]);
    const [total_pl, setTotalPL] = useState(0);
    const [status, setStatus] = useState('OFFLINE');
    
    const workerRef = useRef(null);

    useEffect(() => {
        const workerBlob = new Blob([`
            let ws;
            let active = false;
            let lastTickId = null;
            let isWaiting = false;
            let initialStake = 0.35;
            let currentStake = 0.35;

            self.onmessage = function(e) {
                const { type, payload } = e.data;
                
                if (type === 'START') {
                    active = true;
                    initialStake = payload.stake;
                    currentStake = payload.stake;
                    
                    ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
                    ws.onopen = () => ws.send(JSON.stringify({ authorize: payload.token }));
                    
                    ws.onmessage = (msg) => {
                        const res = JSON.parse(msg.data);
                        
                        if (res.error) {
                            self.postMessage({ type: 'ERROR', data: res.error.message });
                            return;
                        }

                        if (res.msg_type === 'authorize') {
                            self.postMessage({ type: 'STATUS', data: 'CONNECTED' });
                            ws.send(JSON.stringify({ ticks: '1HZ100V', subscribe: 1 }));
                        }

                        // THE SYNC-LOCK ENGINE
                        if (active && res.msg_type === 'tick' && !isWaiting) {
                            if (res.tick.id !== lastTickId) {
                                lastTickId = res.tick.id;
                                const digit = res.tick.quote.toString().slice(-1);
                                isWaiting = true;

                                setTimeout(() => {
                                    if(!active) return;
                                    ws.send(JSON.stringify({
                                        buy: 1, 
                                        price: currentStake,
                                        parameters: {
                                            amount: currentStake,
                                            basis: 'stake',
                                            contract_type: 'DIGITMATCH',
                                            currency: payload.currency,
                                            duration: 1,
                                            duration_unit: 't',
                                            symbol: '1HZ100V',
                                            barrier: parseInt(digit)
                                        },
                                        subscribe: 1
                                    }));
                                }, payload.offset);
                            }
                        }

                        // RESULT & MARTINGALE LOGIC
                        if (res.msg_type === 'proposal_open_contract' && res.proposal_open_contract.is_sold) {
                            const contract = res.proposal_open_contract;
                            
                            if (contract.status === 'lost') {
                                // Martingale for Digit Match (Higher payout means smaller multiplier)
                                currentStake = (currentStake * 1.15).toFixed(2);
                            } else {
                                currentStake = initialStake;
                            }

                            isWaiting = false; // Release lock for next tick
                            self.postMessage({ type: 'RESULT', data: {
                                id: contract.contract_id,
                                target: contract.barrier,
                                exit: contract.exit_tick_display_value.slice(-1),
                                profit: contract.profit,
                                status: contract.status.toUpperCase(),
                                nextStake: currentStake
                            }});
                        }
                    };
                }

                if (type === 'STOP') {
                    active = false;
                    if(ws) ws.close();
                    self.postMessage({ type: 'STATUS', data: 'OFFLINE' });
                }
            };
        `], { type: 'application/javascript' });

        workerRef.current = new Worker(URL.createObjectURL(workerBlob));
        workerRef.current.onmessage = (e) => {
            const { type, data } = e.data;
            if (type === 'STATUS') setStatus(data);
            if (type === 'ERROR') alert(data);
            if (type === 'RESULT') {
                setResults(prev => [data, ...prev].slice(0, 8));
                setTotalPL(v => v + data.profit);
            }
        };

        return () => workerRef.current.terminate();
    }, []);

    const handleToggle = () => {
        if (!is_hunting) {
            if (!token) return alert("Enter Token");
            setIsHunting(true);
            workerRef.current.postMessage({ 
                type: 'START', 
                payload: { token: token.trim(), stake: Number(stake), currency, offset: Number(offset) } 
            });
        } else {
            setIsHunting(false);
            workerRef.current.postMessage({ type: 'STOP' });
        }
    };

    return (
        <div style={ui.container}>
            <div style={ui.wrapper}>
                {/* Header Section */}
                <div style={ui.header}>
                    <div>
                        <h1 style={ui.title}>LONDON SURGICAL <span style={{color:'#0f0'}}>V10</span></h1>
                        <p style={ui.subtitle}>Sync-Lock & Auto-Recovery Enabled</p>
                    </div>
                    <div style={{textAlign:'right'}}>
                        <div style={{...ui.status, color: status === 'CONNECTED' ? '#0f0' : '#f00'}}>{status}</div>
                        <div style={ui.balance}>${total_pl.toFixed(2)}</div>
                    </div>
                </div>

                {/* Control Panel */}
                <div style={ui.panel}>
                    <div style={ui.inputBox}>
                        <label style={ui.label}>DERIV API TOKEN</label>
                        <input type="password" value={token} onChange={e => setToken(e.target.value)} style={ui.input} placeholder="a1-xxxxxxx..." />
                    </div>

                    <div style={ui.grid}>
                        <div style={ui.inputBox}>
                            <label style={ui.label}>BASE STAKE</label>
                            <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={ui.input} />
                        </div>
                        <div style={ui.inputBox}>
                            <label style={ui.label}>CURRENCY</label>
                            <select value={currency} onChange={e => setCurrency(e.target.value)} style={ui.input}>
                                <option value="USD">USD (Demo/Real)</option>
                                <option value="VRTC">VRTC (Classic Demo)</option>
                            </select>
                        </div>
                        <div style={ui.inputBox}>
                            <label style={ui.label}>OFFSET ({offset}ms)</label>
                            <input type="range" min="0" max="100" value={offset} onChange={e => setOffset(e.target.value)} style={ui.range} />
                        </div>
                    </div>

                    <button onClick={handleToggle} style={is_hunting ? ui.btnStop : ui.btnStart}>
                        {is_hunting ? 'SHUTDOWN ENGINE' : 'INITIALIZE SURGICAL STRIKE'}
                    </button>
                </div>

                {/* Results Table */}
                <div style={ui.tableContainer}>
                    <table style={ui.table}>
                        <thead>
                            <tr style={ui.th}>
                                <th>TARGET</th>
                                <th>EXIT</th>
                                <th>STATUS</th>
                                <th>PROFIT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => (
                                <tr key={i} style={ui.tr}>
                                    <td style={{color:'#fff'}}>{r.target}</td>
                                    <td style={{color: r.target === r.exit ? '#0f0' : '#f44'}}>{r.exit}</td>
                                    <td style={{fontSize:'10px'}}>{r.status}</td>
                                    <td style={{color: r.profit >= 0 ? '#0f0' : '#f44'}}>{r.profit.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});

// STYLES - CYBERPUNK TERMINAL THEME
const ui = {
    container: { background: '#050505', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' },
    wrapper: { maxWidth: '500px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #1a1a1a', paddingBottom: '10px' },
    title: { margin: 0, fontSize: '18px', letterSpacing: '1px' },
    subtitle: { margin: 0, fontSize: '10px', color: '#555' },
    status: { fontSize: '10px', fontWeight: 'bold' },
    balance: { fontSize: '24px', fontWeight: 'bold' },
    panel: { background: '#0a0a0a', padding: '20px', borderRadius: '4px', border: '1px solid #111' },
    inputBox: { marginBottom: '15px' },
    label: { fontSize: '9px', color: '#444', marginBottom: '5px', display: 'block' },
    input: { width: '100%', background: '#000', border: '1px solid #222', color: '#0f0', padding: '10px', boxSizing: 'border-box', outline: 'none' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
    range: { width: '100%', accentColor: '#0f0' },
    btnStart: { width: '100%', padding: '15px', background: '#0f0', color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
    btnStop: { width: '100%', padding: '15px', background: '#300', color: '#f44', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
    tableContainer: { marginTop: '20px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', borderBottom: '1px solid #222', color: '#444', fontSize: '10px' },
    tr: { height: '40px', borderBottom: '1px solid #0a0a0a', textAlign: 'left' }
};

export default MakotiMagic;
