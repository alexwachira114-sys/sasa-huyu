import React, { useState, useRef, useEffect } from 'react';

const MakotiMagic = () => {
    const [token, setToken] = useState('');
    const [stake, setStake] = useState(0.35);
    const [offset, setOffset] = useState(0); 
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

                        // THE ULTRASONIC INJECTION
                        if (active && res.msg_type === 'tick' && !isWaiting) {
                            const digit = res.tick.quote.toString().slice(-1);
                            isWaiting = true; // Lock immediately

                            // EXECUTE IMMEDIATELY ON CURRENT TICK
                            setTimeout(() => {
                                if(!active) return;
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
                                    },
                                    subscribe: 1 
                                }));
                            }, payload.offset);
                        }

                        if (res.msg_type === 'proposal_open_contract' && res.proposal_open_contract.is_sold) {
                            const contract = res.proposal_open_contract;
                            isWaiting = false; 
                            
                            // Recovery logic (Small 1.15x bump)
                            if (contract.status === 'lost') {
                                currentStake = (currentStake * 1.15).toFixed(2);
                            } else {
                                currentStake = payload.stake;
                            }
                            
                            self.postMessage({ type: 'RESULT', data: contract });
                        }
                    };
                }
                if (type === 'STOP') { active = false; if(ws) ws.close(); }
            };
        `], { type: 'application/javascript' });

        workerRef.current = new Worker(URL.createObjectURL(workerBlob));
        workerRef.current.onmessage = (e) => {
            const { type, data } = e.data;
            if (type === 'STATUS') setStatus(data);
            if (type === 'RESULT') {
                setResults(prev => [{
                    id: data.contract_id,
                    stake: data.buy_price,
                    target: data.barrier,
                    exit: data.exit_tick_display_value?.slice(-1) || '?',
                    profit: data.profit,
                    status: data.status.toUpperCase()
                }, ...prev].slice(0, 8));
                setTotalPL(v => v + data.profit);
            }
        };
        return () => workerRef.current.terminate();
    }, []);

    const handleToggle = () => {
        if (!is_hunting) {
            setIsHunting(true);
            workerRef.current.postMessage({ 
                type: 'START', 
                payload: { token: token.trim(), stake: Number(stake), offset: Number(offset) } 
            });
        } else {
            setIsHunting(false);
            workerRef.current.postMessage({ type: 'STOP' });
        }
    };

    return (
        <div style={ui.page}>
            <div style={ui.card}>
                <h1 style={ui.title}>SURGICAL INJECTOR <span style={{color:'#0f0'}}>V13</span></h1>
                
                <div style={ui.statsRow}>
                    <div style={{color: status === 'CONNECTED' ? '#0f0' : '#f44'}}>{status}</div>
                    <div style={{fontSize: '28px', color: total_pl >= 0 ? '#0f0' : '#f44'}}>${total_pl.toFixed(2)}</div>
                </div>

                <div style={ui.form}>
                    <input type="password" value={token} onChange={e => setToken(e.target.value)} style={ui.input} placeholder="API TOKEN" />
                    <div style={ui.row}>
                        <input type="number" value={stake} onChange={e => setStake(e.target.value)} style={ui.input} placeholder="STAKE" />
                        <input type="number" value={offset} onChange={e => setOffset(e.target.value)} style={ui.input} placeholder="OFFSET MS" />
                    </div>
                    <button onClick={handleToggle} style={is_hunting ? ui.btnStop : ui.btnStart}>
                        {is_hunting ? 'TERMINATE' : 'INITIALIZE'}
                    </button>
                </div>

                <div style={ui.table}>
                    <div style={ui.tableHeader}>
                        <span>STAKE</span><span>TGT</span><span>EXIT</span><span>P/L</span>
                    </div>
                    {results.map((r) => (
                        <div key={r.id} style={ui.rowResult}>
                            <span style={{color:'#888'}}>{r.stake}</span>
                            <span style={{color:'#fff', fontWeight:'bold'}}>{r.target}</span>
                            <span style={{color: r.target === r.exit ? '#0f0' : '#f44'}}>{r.exit}</span>
                            <span style={{color: r.profit >= 0 ? '#0f0' : '#f44'}}>{r.profit.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ui = {
    page: { background: '#000', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'monospace' },
    card: { width: '450px', background: '#080808', padding: '30px', borderRadius: '10px', border: '1px solid #1a1a1a', textAlign: 'center' },
    title: { fontSize: '24px', color: '#fff', marginBottom: '10px', letterSpacing: '2px' },
    statsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #111' },
    form: { display: 'flex', flexDirection: 'column', gap: '10px' },
    input: { width: '100%', padding: '12px', background: '#000', border: '1px solid #222', color: '#0f0', fontSize: '16px', boxSizing: 'border-box' },
    row: { display: 'flex', gap: '10px' },
    btnStart: { padding: '15px', background: '#0f0', color: '#000', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' },
    btnStop: { padding: '15px', background: '#300', color: '#f44', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' },
    table: { marginTop: '20px' },
    tableHeader: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#444', marginBottom: '10px', padding: '0 10px' },
    rowResult: { display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#0c0c0c', marginBottom: '5px', borderLeft: '3px solid #1a1a1a', fontSize: '16px' }
};

export default MakotiMagic;
