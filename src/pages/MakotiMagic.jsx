import React, { useState, useRef, useEffect } from 'react';

const MakotiMagic = () => {
    const [token, setToken] = useState('');
    const [stake, setStake] = useState(0.35);
    const [offset, setOffset] = useState(0);
    const [currency, setCurrency] = useState('USD');
    const [is_hunting, setIsHunting] = useState(false);
    const [results, setResults] = useState([]);
    const [total_pl, setTotalPL] = useState(0);
    const [status, setStatus] = useState('OFFLINE');
    
    const workerRef = useRef(null);

    useEffect(() => {
        const workerBlob = new Blob([`
            let ws;
            let active = false;
            let isWaiting = false;
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
                            self.postMessage({ type: 'STATUS', data: 'CONNECTED' });
                            ws.send(JSON.stringify({ ticks: '1HZ100V', subscribe: 1 }));
                        }

                        // THE TRIGGER
                        if (active && res.msg_type === 'tick' && !isWaiting) {
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
                                    subscribe: 1 // Crucial for receiving results
                                }));
                            }, payload.offset);
                        }

                        // CATCH RESULTS
                        if (res.msg_type === 'proposal_open_contract') {
                            const contract = res.proposal_open_contract;
                            if (contract.is_sold) {
                                isWaiting = false; // Reset gate
                                if (contract.status === 'lost') {
                                    currentStake = (currentStake * 1.12).toFixed(2);
                                } else {
                                    currentStake = payload.stake;
                                }
                                self.postMessage({ type: 'RESULT', data: contract });
                            }
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
            if (type === 'RESULT') {
                // Use functional update to ensure we don't miss any data
                setResults(prev => [{
                    id: data.contract_id,
                    target: data.barrier,
                    exit: data.exit_tick_display_value?.slice(-1) || '?',
                    profit: data.profit,
                    status: data.status.toUpperCase()
                }, ...prev].slice(0, 6));
                
                setTotalPL(v => v + data.profit);
            }
        };
        
        return () => workerRef.current.terminate();
    }, []);

    const handleToggle = () => {
        if (!is_hunting) {
            if (!token) return alert("Paste your token!");
            setIsHunting(true);
            setResults([]); // Clear old results
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
        <div style={ui.page}>
            <div style={ui.card}>
                <h1 style={ui.title}>MAKOTI <span style={{color:'#0f0'}}>V12</span></h1>
                
                <div style={ui.statsRow}>
                    <div style={{color: status === 'CONNECTED' ? '#0f0' : '#f44', fontWeight:'bold'}}>{status}</div>
                    <div style={{fontSize: '24px', color: total_pl >= 0 ? '#0f0' : '#f44'}}>${total_pl.toFixed(2)}</div>
                </div>

                <div style={ui.form}>
                    <label style={ui.label}>API TOKEN</label>
                    <input type="password" value={token} onChange={e => setToken(e.target.value)} style={ui.input} />
                    
                    <div style={ui.row}>
                        <div style={{flex:1}}>
                            <label style={ui.label}>STAKE</label>
                            <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={ui.input} />
                        </div>
                        <div style={{flex:1}}>
                            <label style={ui.label}>OFFSET (MS)</label>
                            <input type="number" value={offset} onChange={e => setOffset(e.target.value)} style={ui.input} />
                        </div>
                    </div>

                    <button onClick={handleToggle} style={is_hunting ? ui.btnStop : ui.btnStart}>
                        {is_hunting ? 'STOP ENGINE' : 'START SURGICAL STRIKE'}
                    </button>
                </div>

                <div style={ui.table}>
                    {results.length === 0 && is_hunting && <div style={{color:'#444', marginTop:'20px'}}>Waiting for first result...</div>}
                    {results.map((r) => (
                        <div key={r.id} style={ui.rowResult}>
                            <span>TGT: <b>{r.target}</b></span>
                            <span>EXIT: <b style={{color: r.target === r.exit ? '#0f0' : '#f44'}}>{r.exit}</b></span>
                            <span style={{color: r.profit >= 0 ? '#0f0' : '#f44', fontWeight:'bold'}}>{r.status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ui = {
    page: { background: '#000', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'monospace' },
    card: { width: '450px', background: '#0a0a0a', padding: '40px', borderRadius: '20px', border: '1px solid #222', textAlign: 'center', boxShadow: '0 0 20px rgba(0,255,0,0.05)' },
    title: { fontSize: '32px', color: '#fff', marginBottom: '10px', letterSpacing: '3px' },
    statsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', padding: '10px', borderBottom: '1px solid #111' },
    form: { display: 'flex', flexDirection: 'column', gap: '15px' },
    label: { color: '#555', fontSize: '12px', textAlign: 'left', display: 'block' },
    input: { width: '100%', padding: '15px', background: '#000', border: '1px solid #333', color: '#0f0', fontSize: '20px', borderRadius: '10px', boxSizing: 'border-box' },
    row: { display: 'flex', gap: '10px' },
    btnStart: { padding: '20px', background: '#0f0', color: '#000', border: 'none', borderRadius: '10px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer' },
    btnStop: { padding: '20px', background: '#300', color: '#f44', border: 'none', borderRadius: '10px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer' },
    table: { marginTop: '30px' },
    rowResult: { display: 'flex', justifyContent: 'space-between', padding: '15px', background: '#111', borderRadius: '10px', marginBottom: '8px', borderLeft: '5px solid #222', color: '#fff', fontSize: '18px' }
};

export default MakotiMagic;
