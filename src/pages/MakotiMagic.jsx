import React, { useState, useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import { localize } from '@deriv-com/translations';
import './MakotiMagic.scss';

const MakotiMagic = observer(() => {
    const { client } = useStore();
    
    // --- STATE MANAGEMENT ---
    const [is_hunting, setIsHunting] = useState(false);
    const [last_digit, setLastDigit] = useState(null);
    const [status_message, setStatusMessage] = useState("SYSTEM READY - AWAITING TRIGGER");
    const [stake, setStake] = useState(1.00);
    const [symbol, setSymbol] = useState('R_100');
    
    // Internal references for speed
    const is_active = useRef(false);
    const last_tick_id = useRef(null);

    // --- THE STRIKE EXECUTION (THE MATCH PURCHASE) ---
    const fireStrike = useCallback((digit) => {
        if (!api_base.api || api_base.api.readyState !== 1) {
            setStatusMessage("ERROR: SOCKET DISCONNECTED");
            setIsHunting(false);
            is_active.current = false;
            return;
        }

        // Direct Socket Buy Request
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
                symbol: symbol,
                barrier: digit 
            }
        }).then((response) => {
            if (response.error) {
                setStatusMessage(`GATE CLOSED: ${response.error.message}`);
            } else {
                setStatusMessage(`SUCCESS: STRIKE CAPTURED DIGIT ${digit}`);
            }
        }).catch(() => {
            setStatusMessage("CRITICAL ERROR: STRIKE FAILED");
        });

        // IMMEDIATELY DISARM AFTER THE FIRST PACKET IS SENT
        setIsHunting(false);
        is_active.current = false;
    }, [stake, symbol, client.currency]);

    // --- THE GATEWAY LISTENER ---
    useEffect(() => {
        let subscription;
        if (is_hunting && api_base.api) {
            is_active.current = true;
            setStatusMessage(">>> HUNTING: LISTENING FOR NEXT DIGIT <<<");

            subscription = api_base.api.onMessage().subscribe((msg) => {
                if (is_active.current && msg.data.msg_type === 'tick') {
                    const tick = msg.data.tick;
                    
                    if (tick.id !== last_tick_id.current) {
                        last_tick_id.current = tick.id;
                        const digit = tick.quote.toString().slice(-1);
                        
                        setLastDigit(digit);
                        fireStrike(digit); // Execute immediately
                    }
                }
            });
        }
        return () => {
            if (subscription) subscription.unsubscribe();
        };
    }, [is_hunting, fireStrike]);

    // --- UI STYLES ---
    const inputStyle = {
        background: '#000',
        color: '#0f0',
        border: '1px solid #0f0',
        padding: '12px',
        width: '100%',
        marginTop: '8px',
        fontSize: '16px',
        borderRadius: '4px',
        outline: 'none'
    };

    return (
        <div style={{ padding: '40px', background: '#000', color: '#0f0', minHeight: '100vh', fontFamily: 'monospace' }}>
            <h2 style={{ textAlign: 'center', letterSpacing: '3px', textShadow: '0 0 10px #0f0', marginBottom: '30px' }}>
                MAKOTI MAGIC: GATEWAY HUNTER v2.0
            </h2>

            {/* CONFIGURATION SECTION */}
            <div style={{ maxWidth: '600px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', border: '1px solid #333', padding: '20px', borderRadius: '8px' }}>
                <div>
                    <label style={{ fontSize: '12px' }}>STAKE AMOUNT</label>
                    <input 
                        type="number" 
                        value={stake} 
                        onChange={(e) => setStake(e.target.value)}
                        style={inputStyle}
                        disabled={is_hunting}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '12px' }}>VOLATILITY INDEX</label>
                    <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} disabled={is_hunting}>
                        <option value="R_10">Volatility 10</option>
                        <option value="R_25">Volatility 25</option>
                        <option value="R_50">Volatility 50</option>
                        <option value="R_75">Volatility 75</option>
                        <option value="R_100">Volatility 100</option>
                        <option value="1HZ10V">Volatility 10 (1s)</option>
                        <option value="1HZ100V">Volatility 100 (1s)</option>
                    </select>
                </div>
            </div>

            {/* MAIN DISPLAY */}
            <div style={{ textAlign: 'center', margin: '50px 0' }}>
                <div style={{ fontSize: '14px', marginBottom: '10px', color: '#666' }}>GATE CAPTURE RESULT</div>
                <div style={{ 
                    fontSize: '180px', 
                    lineHeight: '1', 
                    fontWeight: 'bold', 
                    color: is_hunting ? '#222' : '#0f0',
                    transition: 'color 0.2s ease'
                }}>
                    {last_digit ?? '-'}
                </div>
                <div style={{ 
                    marginTop: '20px', 
                    padding: '10px', 
                    background: is_hunting ? '#300' : '#111', 
                    color: is_hunting ? '#f00' : '#0f0',
                    border: '1px solid'
                }}>
                    {status_message}
                </div>
            </div>

            {/* TRIGGER BUTTON */}
            <div style={{ textAlign: 'center' }}>
                <button 
                    onClick={() => setIsHunting(true)}
                    disabled={is_hunting}
                    style={{
                        padding: '25px 80px',
                        fontSize: '28px',
                        fontWeight: 'bold',
                        background: is_hunting ? '#111' : '#0f0',
                        color: is_hunting ? '#444' : '#000',
                        border: 'none',
                        cursor: is_hunting ? 'not-allowed' : 'pointer',
                        borderRadius: '50px',
                        boxShadow: is_hunting ? 'none' : '0 0 25px rgba(0, 255, 0, 0.5)',
                        transition: 'all 0.3s ease'
                    }}
                >
                    {is_hunting ? "WAITING FOR GATE..." : "TRIGGER HUNT"}
                </button>
                <p style={{ marginTop: '20px', fontSize: '12px', color: '#444' }}>
                    ONE-SHOT STRIKE MODE ENABLED
                </p>
            </div>
        </div>
    );
});

export default MakotiMagic;
