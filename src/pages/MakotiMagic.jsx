import React, { useState, useEffect, useRef } from 'react';

const Makotimagic = () => {
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState('SYSTEM READY');
    const [logs, setLogs] = useState([]);
    const [volatility, setVolatility] = useState('R_100');
    const [stake, setStake] = useState(10);
    const [lastDigit, setLastDigit] = useState(null);

    const ws = useRef(null);
    // Use a ref to get the latest isRunning value inside the WebSocket event listener
    const isRunningRef = useRef(isRunning);
    useEffect(() => {
        isRunningRef.current = isRunning;
    }, [isRunning]);

    const addLog = (msg) => {
        setLogs(prev => [`> ${msg}`, ...prev.slice(0, 10)]); // Increased log history
    };

    const executePureHack = (digit) => {
        const payload = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: 'DIGITMATCH',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: volatility,
                barrier: digit.toString()
            }
        };
        ws.current.send(JSON.stringify(payload));
        setStatus('EXECUTING MATCH...');
        addLog(`Trade placed for digit ${digit}.`);
        
        // Stop running after executing the hack
        setIsRunning(false);
        // Unsubscribe from ticks to prevent further executions until restarted
        ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
    };

    // Effect to initialize and manage the WebSocket connection
    useEffect(() => {
        const app_id = 101585;
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const server_url = localStorage.getItem('config.server_url') || 'ws.binaryws.com';
        
        ws.current = new WebSocket(`wss://${server_url}/websockets/v3?app_id=${app_id}`);

        ws.current.onopen = () => {
            addLog('Connection opened.');
            if (token) {
                ws.current.send(JSON.stringify({ authorize: token }));
            } else {
                addLog("Warning: Not logged in. Please login to trade.");
            }
        };

        ws.current.onclose = () => {
            addLog('Connection closed.');
            if (isRunningRef.current) {
                setStatus('SYSTEM STOPPED');
                setIsRunning(false);
            }
        };

        ws.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);

            if (data.error) {
                addLog(`ERROR: ${data.error.message}`);
                setIsRunning(false); // Stop on error
                return;
            }

            switch (data.msg_type) {
                case 'authorize':
                    addLog('Authorized successfully.');
                    break;
                case 'tick':
                    const digit = parseInt(data.tick.quote.toString().slice(-1));
                    setLastDigit(digit);

                    // If running, execute the hack on the first tick received
                    if (isRunningRef.current) {
                        executePureHack(digit);
                    }
                    break;
                case 'buy':
                    addLog(`SUCCESS: Contract ${data.buy.contract_id} purchased.`);
                    setStatus('SYSTEM READY');
                    break;
                default:
                    // You can add more handlers here for contract results etc.
                    break;
            }
        };

        // Cleanup on component unmount
        return () => {
            if(ws.current) {
                ws.current.close();
            }
        };
    }, []); // Empty dependency array ensures this effect runs only once

    const toggleHack = () => {
        if (!isRunning) {
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (!token) {
                addLog('ERROR: Please login first');
                return;
            }
            if (ws.current?.readyState !== WebSocket.OPEN) {
                addLog('ERROR: WebSocket is not connected. Please wait.');
                return;
            }
            // Subscribe to ticks
            ws.current.send(JSON.stringify({ ticks: volatility, subscribe: 1 }));
            setIsRunning(true);
            setStatus('INTERCEPTING...');
            addLog(`Makotimagic Active: Scanning ${volatility}...`);
        } else {
            // Unsubscribe from ticks
            ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
            setIsRunning(false);
            setStatus('SYSTEM STOPPED');
            addLog('Makotimagic Deactivated.');
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>MAKOTIMAGIC v1.0</h2>
                <div style={{...styles.status, color: isRunning ? '#00ff00' : '#ff0000'}}>
                    {status}
                </div>
            </div>

            <div style={styles.grid}>
                <div style={styles.card}>
                    <label style={styles.label}>Volatility</label>
                    <select style={styles.input} onChange={(e) => setVolatility(e.target.value)} value={volatility} disabled={isRunning}>
                        <option value="R_10">Volatility 10 (1s)</option>
                        <option value="R_50">Volatility 50 (1s)</option>
                        <option value="R_100">Volatility 100 (1s)</option>
                    </select>

                    <label style={styles.label}>Stake (USD)</label>
                    <input style={styles.input} type="number" value={stake} onChange={(e) => setStake(e.target.value)} disabled={isRunning} />
                </div>

                <div style={styles.card}>
                    <label style={styles.label}>Intercepted Digit</label>
                    <div style={styles.bigDigit}>{lastDigit ?? '--'}</div>
                </div>
            </div>

            <button 
                style={{...styles.button, backgroundColor: isRunning ? '#ff0000' : '#00ff00'}}
                onClick={toggleHack}
            >
                {isRunning ? 'STOP HACK' : 'RUN MAKOTIMAGIC'}
            </button>

            <div style={styles.console}>
                {logs.map((log, i) => <div key={i} style={styles.logLine}>{log}</div>)}
            </div>
        </div>
    );
};

const styles = {
    container: { background: '#0a0a0a', padding: '20px', borderRadius: '10px', color: '#fff', fontFamily: 'monospace', border: '1px solid #333' },
    header: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #222', paddingBottom: '10px' },
    title: { margin: 0, color: '#00ff00', fontSize: '1.2rem' },
    status: { fontSize: '0.8rem', fontWeight: 'bold' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
    card: { background: '#111', padding: '15px', borderRadius: '5px', border: '1px solid #222' },
    label: { display: 'block', fontSize: '0.7rem', color: '#666', marginBottom: '5px', textTransform: 'uppercase' },
    input: { width: '100%', background: '#000', border: '1px solid #333', color: '#00ff00', padding: '8px', marginBottom: '10px', outline: 'none' },
    bigDigit: { fontSize: '3rem', textAlign: 'center', fontWeight: 'bold', color: '#00ff00' },
    button: { width: '100%', padding: '15px', color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' },
    console: { marginTop: '20px', background: '#000', padding: '10px', height: '120px', fontSize: '0.7rem', overflowY: 'auto', border: '1px solid #111' }, // Increased height
    logLine: { color: '#00ff00', marginBottom: '3px' }
};

export default Makotimagic;
