import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { TradeExecutionStore, OpenPosition } from '../trade-execution-store';

type Props = { store: TradeExecutionStore };

const formatTime = (epoch: number) => {
    if (!epoch) return '—';
    return new Date(epoch * 1000).toLocaleTimeString();
};

const PositionRow = ({ pos, currency }: { pos: OpenPosition; currency: string }) => {
    const profitClass =
        pos.status === 'open'
            ? pos.profit_loss >= 0
                ? 'positive'
                : 'negative'
            : pos.status;

    return (
        <div className={`dt-positions__row dt-positions__row--${pos.status}`}>
            <div className='dt-positions__contract-info'>
                <span className='dt-positions__type'>{pos.contract_type.replace('DIGIT', 'Digit ')}</span>
                <span className='dt-positions__symbol'>{pos.display_name || pos.underlying_symbol}</span>
            </div>
            <div className='dt-positions__prices'>
                <div className='dt-positions__price-item'>
                    <span className='dt-positions__price-label'>Buy</span>
                    <span className='dt-positions__price-val'>
                        {pos.buy_price.toFixed(2)} {currency}
                    </span>
                </div>
                {pos.status === 'open' && (
                    <div className='dt-positions__price-item'>
                        <span className='dt-positions__price-label'>Current</span>
                        <span className='dt-positions__price-val'>
                            {pos.bid_price ? `${pos.bid_price.toFixed(2)} ${currency}` : '...'}
                        </span>
                    </div>
                )}
                <div className='dt-positions__price-item'>
                    <span className='dt-positions__price-label'>
                        {pos.status === 'open' ? 'P/L' : 'Result'}
                    </span>
                    <span className={`dt-positions__pnl dt-positions__pnl--${profitClass}`}>
                        {pos.status !== 'open'
                            ? pos.status === 'won'
                                ? `+${pos.profit_loss.toFixed(2)}`
                                : `${pos.profit_loss.toFixed(2)}`
                            : pos.profit_loss >= 0
                            ? `+${pos.profit_loss.toFixed(2)}`
                            : `${pos.profit_loss.toFixed(2)}`}{' '}
                        {currency}
                    </span>
                </div>
            </div>
            <div className='dt-positions__meta'>
                <span>{formatTime(pos.purchase_time)}</span>
                <span className={`dt-positions__badge dt-positions__badge--${pos.status}`}>
                    {pos.status.toUpperCase()}
                </span>
            </div>
        </div>
    );
};

const OpenPositions = observer(({ store }: Props) => {
    const [collapsed, setCollapsed] = useState(false);
    const { openPositions, currency } = store;

    return (
        <div className='dt-positions'>
            <button
                type='button'
                className='dt-positions__header'
                onClick={() => setCollapsed(c => !c)}
            >
                <span>
                    Open Positions
                    {openPositions.length > 0 && (
                        <span className='dt-positions__count'>{openPositions.length}</span>
                    )}
                </span>
                <svg
                    width='12'
                    height='8'
                    viewBox='0 0 12 8'
                    className={`dt-positions__chevron${collapsed ? ' dt-positions__chevron--collapsed' : ''}`}
                >
                    <path d='M1 1l5 5 5-5' stroke='currentColor' strokeWidth='1.5' fill='none' />
                </svg>
            </button>

            {!collapsed && (
                <div className='dt-positions__body'>
                    {openPositions.length === 0 ? (
                        <div className='dt-positions__empty'>
                            <span>No open positions</span>
                        </div>
                    ) : (
                        openPositions.map(pos => (
                            <PositionRow key={pos.contract_id} pos={pos} currency={currency} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
});

export default OpenPositions;
