import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './MakotiMagic.scss';

const MakotiMagic = observer(() => {
    const { ui, quick_strategy } = useStore();
    const { is_desktop } = ui;
    // const { setLossThreshold, setProfitThreshold, setSize, loss_threshold, profit_threshold, size } = quick_strategy;
    const [is_running, setIsRunning] = React.useState(false);
    const [predicted_digit, setPredictedDigit] = React.useState(null);
    const [min_confidence, setMinConfidence] = React.useState(40);

    const handleScan = () => {
        setIsRunning(true);
        // Simulate a scan
        setTimeout(() => {
            const digit = Math.floor(Math.random() * 10);
            setPredictedDigit(digit);
            setIsRunning(false);
        }, 2000);
    };
    
    const markets = [
        { value: 'synthetic_index', label: 'Synthetics' },
        { value: 'forex', label: 'Forex' },
        { value: 'stock', label: 'Stocks & indices' },
        { value: 'cryptocurrency', label: 'Cryptocurrencies' },
        { value: 'commodities', label: 'Commodities' },
    ];

    const strategies = [
        { value: 'martingale', label: 'Martingale' },
        { value: 'dalembert', label: 'D\'Alembert' },
        { value: 'oscars_grind', label: 'Oscar\'s Grind' },
        { value: 'custom', label: 'Custom Strategy' },
    ];
    
    return (
        <div className='makoti-magic'>
            <div className='mm-matrix-bg'>
                {Array.from({ length: 200 }).map((_, i) => (
                    <span key={i} className='mm-matrix-char'>
                        {Math.random().toString(36)[2]}
                    </span>
                ))}
            </div>
            
            <div className='mm-body'>
                <div className='mm-panel'>
                    <h2 className='mm-panel__title'>MAKOTI MAGIC</h2>

                    <div style={{ marginBottom: '16px' }}>
                        <div className='mm-row-label'>Market</div>
                        <div className='mm-f'>
                            <select className='mm-sel'>
                                {markets.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <div className='mm-row-label'>Strategy</div>
                        <div className='mm-f'>
                            <select className='mm-sel'>
                                {strategies.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <div className='mm-row-label'>Min Confidence ({min_confidence}%)</div>
                        <div className='mm-f'>
                            <input 
                                type="range" 
                                min="1" 
                                max="100" 
                                value={min_confidence} 
                                onChange={e => setMinConfidence(parseInt(e.target.value))}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>

                    <div className='mm-prediction'>
                        <div className='mm-prediction__title'>Predicted Last Digit</div>
                        <div className={`mm-prediction__digit ${predicted_digit !== null ? 'mm-prediction__digit--active' : ''}`}>
                            {predicted_digit ?? '?'}
                        </div>
                    </div>

                    <div className='mm-cta-wrap'>
                        <button className='mm-cta' onClick={handleScan} disabled={is_running}>
                            {is_running ? 'Scanning...' : 'Scan'}
                        </button>
                        <button className='mm-cta mm-cta--secondary' disabled={is_running}>
                            Load Bot
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default MakotiMagic;
