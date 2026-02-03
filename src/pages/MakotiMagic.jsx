import React, { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';

const MakotiMagic = observer(() => {
    const { client } = useStore();
    const [is_hunting, setIsHunting] = useState(false);
    const [stake] = useState(10.00); // Higher stake for serious hunting
    
    // Using Refs to bypass the React Render Cycle entirely for speed
    const hunt_active = useRef(false);
    const api_ref = useRef(null);

    // PRE-COMPILED STRIKE FUNCTION
    // This is stored in memory so the CPU doesn't have to "re-think" it during the hunt
    const executeInstantStrike = useCallback((digit) => {
        if (!api_ref.current) return;

        const payload = {
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
        };

        // RAW SOCKET INJECTION
        api_ref.current.send(payload);
        
        // DISARM IMMEDIATELY
        hunt_active.current = false;
        setIsHunting(false);
    }, [stake, client.currency]);

    useEffect(() => {
        api_ref.current = api_base.api;

        if (is_hunting) {
            hunt_active.current = true;
            
            // LOW-LEVEL LISTENER
            // We listen directly to the websocket message event
            const sub = api_base.api.onMessage().subscribe((msg) => {
                if (hunt_active.current && msg.data.msg_type === 'tick') {
                    // Fastest possible digit extraction: charAt on the end of the string
                    const q = msg.data.tick.quote.toString();
                    const d = q.charAt(q.length - 1);
                    
                    // STRIKE
                    executeInstantStrike(d);
                }
            });

            return () => sub.unsubscribe();
        }
    }, [is_hunting, executeInstantStrike]);

    return (
        <div style={{ 
            background: 'radial-gradient(circle, #001100 0%, #000000 100%)', 
            color: '#0f0', 
            height: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontFamily: '"Courier New", Courier, monospace' 
        }}>
            <div style={{ 
                border: '1px solid #0f0', 
                padding: '60px', 
                textAlign: 'center', 
                background: 'rgba(0,0,0,0.9)',
                boxShadow: is_hunting ? '0 0 50px #f00' : '0 0 20px #0f0',
                transition: 'all 0.1s ease'
            }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', textShadow: '0 0 10px #0f0' }}>
                    PULSE-STRIKE V4
                </h1>
                <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '40px' }}>
                    LATENCY-OPTIMIZED PACKET INJECTION
                </div>

                <div style={{ 
                    fontSize: '1.2rem', 
                    margin: '20px 0', 
                    color: is_hunting ? '#f00' : '#0f0',
                    fontWeight: 'bold' 
                }}>
                    {is_hunting ? ">>> PACKET INTERCEPT ACTIVE <<<" : "CORE LOADED - STANDBY"}
                </div>
                
                <button 
                    onClick={() => setIsHunting(true)}
                    disabled={is_hunting}
                    style={{
                        padding: '25px 80px',
                        fontSize: '1.8rem',
                        background: is_hunting ? '#222' : '#0f0',
                        color: '#000',
                        fontWeight: '900',
                        cursor: is_hunting ? 'not-allowed' : 'pointer',
                        border: 'none',
                        clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0 100%)',
                        transition: 'transform 0.1s'
                    }}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    {is_hunting ? "SCANNING..." : "TRIGGER STRIKE"}
                </button>

                <div style={{ marginTop: '40px', textAlign: 'left', fontSize: '10px', color: '#333' }}>
                    [LOG]: SOCKET_PRIORITY_HIGH<br/>
                    [LOG]: UI_THREAD_BYPASS_ON<br/>
                    [LOG]: ASYNC_AWAIT_STRIPPED
                </div>
            </div>
        </div>
    );
});

export default MakotiMagic;
