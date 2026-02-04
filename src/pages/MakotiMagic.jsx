import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';

const MakotiMagic = observer(() => {
    const { client } = useStore();
    const [is_hunting, setIsHunting] = useState(false);
    const [stake, setStake] = useState(0.35);
    const [results, setResults] = useState([]);
    const [total_pl, setTotalPL] = useState(0);
    const [latency, setLatency] = useState(0);
    
    const workerRef = useRef(null);

    useEffect(() => {
        // THE WORKER: This code runs on a separate CPU thread
        const workerBlob = new Blob([`
            let ws;
            let active = false;
            let currentStake = 0.35;

            self.onmessage = function(e) {
                const { type, payload } = e.data;
                
                if (type === 'START') {
                    active = true;
                    currentStake = payload.stake;
                    ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
                    
                    ws.onopen = () => ws.send(JSON.stringify({ authorize: payload.token }));
                    
                    ws.onmessage = (msg) => {
                        const res = JSON.parse(msg.data);
                        
                        if (res.msg_type === 'authorize') {
                            ws.send(JSON.stringify({ ticks: '1HZ100V' }));
                        }

                        if (active && res.msg_type === 'tick') {
                            const startTime = Date.now();
                            const digit = res.tick.quote.toString().slice(-1);
                            
                            ws.send(JSON.stringify({
                                buy: 1, 
                                price: currentStake,
                                parameters: {
                                    amount: currentStake,
                                    basis: 'stake',
                                    contract_type: 'DIGITMATCH',
                                    currency: 'USD',
                                    duration: 1,
                                    duration_unit: 't',
                                    symbol: '1HZ100V',
                                    barrier: parseInt(digit)
                                }
                            }));
                            // Send latency feedback to UI
                            self.postMessage({ type: 'LATENCY', data: Date.now() - startTime });
                        }

                        if (res.msg_type === 'proposal_open_contract' && res.proposal_open_contract.is_sold) {
                            self.postMessage({ type: 'RESULT', data: res.proposal_open_contract });
                        }
                    };
                }

                if (type === 'STOP') {
                    active = false;
                    if(ws) ws.close();
                }

                if (type === 'UPDATE_STAKE') {
                    currentStake = payload;
                }
            };
        `], { type: 'application/javascript' });

        workerRef.current = new Worker(URL.createObjectURL(workerBlob));

        // Listen for messages FROM the Worker thread
        workerRef.current.onmessage = (e) => {
            const { type, data } = e.data;
            if (type === 'RESULT') {
                setResults(prev => [{
                    target: data.barrier,
                    entry: data.entry_tick_display_value.slice(-1),
                    exit: data.exit_tick_display_value.slice(-1),
                    status: data.status.toUpperCase(),
                    profit: data.profit
                }, ...prev].slice(0, 10));
                setTotalPL(v => v + data.profit);
            }
            if (type === 'LATENCY') {
                setLatency(data);
            }
        };

        return () => workerRef.current.terminate();
    }, []);

    const handleToggle = () => {
        if (!is_hunting) {
            workerRef.current.postMessage({ 
                type: 'START', 
                payload: { token: client.token, stake: Number(stake) } 
            });
        } else {
            workerRef.current.postMessage({ type: 'STOP' });
        }
        setIsHunting(!is_hunting);
    };

    return (
        <div style={ui.container}>
            <div style={ui.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '10px', color: latency < 15 ? '#0f0' : '#f00' }}>
                        LATENCY: {latency}ms {latency < 15 ? '(ULTRA)' : '(LAGGING)'}
                    </span>
                    <span style={{ fontSize: '12px' }}>V8 WORKER ENGINE</span>
                </div>
                
                <div style={ui.inputGroup}>
                    <label style={{ fontSize: '10px', color: '#666' }}>STAKE AMOUNT</label><br/>
                    <input 
                        type="number" 
                        value={stake} 
                        onChange={(e) => {
                            setStake(e.target.value);
                            workerRef.current.postMessage({ type: 'UPDATE_STAKE', payload: Number(e.target.value) });
                        }} 
                        style={ui.input} 
                    />
                </div>

                <button onClick={handleToggle} style={{ ...ui.btn, background: is_hunting ? '#300' : '#040', color: is_hunting ? '#f00' : '#0f0' }}>
                    {is_hunting ? 'STOP SCANNER' : 'START SURGICAL STRIKE'}
                </button>

                <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '12px', color: '#444' }}>ACCOUNT BALANCE (P/L)</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: total_pl >= 0 ? '#0f0' : '#f00' }}>
                        ${total_pl.toFixed(2)}
                    </div>
                </div>
            </div>

            <div style={ui.tableWrapper}>
                <table style={ui.table}>
                    <thead>
                        <tr>
                            <th>TGT</th>
                            <th>ENT</th>
                            <th>EXT</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((r, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #111' }}>
                                <td style={{ color: '#ff0' }}>{r.target}</td>
                                <td style={{ color: r.target === r.entry ? '#0f0' : '#f00' }}>{r.entry}</td>
                                <td>{r.exit}</td>
                                <td style={{ color: r.status === 'WON' ? '#0f0' : '#f00', fontWeight: 'bold' }}>{r.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

const ui = {
    container: { background: '#000', color: '#fff', minHeight: '100vh', padding: '15px', fontFamily: 'monospace' },
    card: { background: '#050505', padding: '20px', borderRadius: '4px', border: '1px solid #1a1a1a', textAlign: 'center' },
    inputGroup: { marginBottom: '20px' },
    input: { background: '#000', color: '#0f0', border: 'none', borderBottom: '2px solid #0f0', padding: '10px', width: '100px', textAlign: 'center', fontSize: '24px', outline: 'none' },
    btn: { width: '100%', padding: '20px', fontWeight: 'bold', border: '1px solid currentColor', cursor: 'pointer', fontSize: '16px', transition: '0.3s' },
    tableWrapper: { marginTop: '20px', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'center' }
};

export default MakotiMagic;