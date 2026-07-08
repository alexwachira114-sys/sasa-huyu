import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { TradeExecutionStore } from './trade-execution-store';
import MarketSelector from './components/MarketSelector';
import ContractTypeSelector from './components/ContractTypeSelector';
import TradeParameters from './components/TradeParameters';
import PurchaseButtons from './components/PurchaseButtons';
import OpenPositions from './components/OpenPositions';

type Props = {
    token: string | null;
    currency: string;
};

const SpotDisplay = observer(({ store }: { store: TradeExecutionStore }) => {
    const sym = store.selectedSymbolInfo;
    return (
        <div className='dt-spot'>
            <div className='dt-spot__symbol'>
                {sym?.display_name || store.symbol}
            </div>
            <div className='dt-spot__price'>
                {store.spotPrice || '—'}
            </div>
        </div>
    );
});

const ConnectionBanner = observer(({ store }: { store: TradeExecutionStore }) => {
    if (store.isConnected) return null;
    return (
        <div className='dt-banner dt-banner--connecting'>
            <span className='dt-banner__dot' />
            <span>Connecting to markets...</span>
        </div>
    );
});

const NotLoggedInNotice = () => (
    <div className='dt-notice'>
        <div className='dt-notice__icon'>⚠️</div>
        <div className='dt-notice__text'>
            <strong>Demo mode</strong> — You can view live prices but must log in to trade.
        </div>
    </div>
);

const DTraderPanel = observer(({ token, currency }: Props) => {
    const storeRef = useRef<TradeExecutionStore | null>(null);
    const [store, setStore] = useState<TradeExecutionStore | null>(null);

    useEffect(() => {
        const s = new TradeExecutionStore();
        storeRef.current = s;
        s.init(token, currency);
        setStore(s);
        return () => {
            s.destroy();
        };
    }, [token, currency]);

    if (!store) {
        return (
            <div className='dt-loading'>
                <div className='dt-loading__spinner' />
                <span>Initializing trade engine...</span>
            </div>
        );
    }

    const isGuest = !token;

    return (
        <div className='dt-panel'>
            <ConnectionBanner store={store} />

            <div className='dt-panel__header'>
                <MarketSelector store={store} />
                <ContractTypeSelector store={store} />
            </div>

            <div className='dt-panel__body'>
                <div className='dt-panel__left'>
                    <SpotDisplay store={store} />
                    <div className='dt-panel__chart-placeholder'>
                        <div className='dt-panel__chart-label'>Live Price</div>
                        <PriceHistory store={store} />
                    </div>
                </div>

                <div className='dt-panel__right'>
                    {isGuest && <NotLoggedInNotice />}
                    <TradeParameters store={store} />
                    {!isGuest && <PurchaseButtons store={store} />}
                    {isGuest && (
                        <div className='dt-guest-actions'>
                            <button
                                className='dt-guest-actions__btn'
                                onClick={() => {
                                    window.location.href = '/';
                                }}
                                type='button'
                            >
                                Log in to Trade
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <OpenPositions store={store} />
        </div>
    );
});

const MAX_TICKS = 60;

const PriceHistory = observer(({ store }: { store: TradeExecutionStore }) => {
    const [ticks, setTicks] = useState<{ price: string; time: number }[]>([]);

    useEffect(() => {
        if (!store.spotPrice || !store.spotTime) return;
        setTicks(prev => {
            const next = [...prev, { price: store.spotPrice, time: store.spotTime }];
            return next.slice(-MAX_TICKS);
        });
    }, [store.spotPrice, store.spotTime]);

    if (ticks.length < 2) {
        return (
            <div className='dt-price-history dt-price-history--empty'>
                Waiting for live data...
            </div>
        );
    }

    const prices = ticks.map(t => parseFloat(t.price)).filter(p => !isNaN(p));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const w = 400;
    const h = 120;
    const pts = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * w;
        const y = h - ((p - min) / range) * (h - 20) - 10;
        return `${x},${y}`;
    });
    const path = `M ${pts.join(' L ')}`;

    const last = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const isUp = last >= prev;

    return (
        <div className='dt-price-history'>
            <svg
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio='none'
                className={`dt-price-history__svg dt-price-history__svg--${isUp ? 'up' : 'down'}`}
            >
                <path d={path} fill='none' strokeWidth='2' stroke='currentColor' />
                <circle
                    cx={parseFloat(pts[pts.length - 1].split(',')[0])}
                    cy={parseFloat(pts[pts.length - 1].split(',')[1])}
                    r='4'
                    fill='currentColor'
                />
            </svg>
            <div className={`dt-price-history__change dt-price-history__change--${isUp ? 'up' : 'down'}`}>
                {isUp ? '▲' : '▼'} {Math.abs(last - prev).toFixed(store.selectedSymbolInfo?.decimal_places ?? 2)}
            </div>
        </div>
    );
});

export default DTraderPanel;
