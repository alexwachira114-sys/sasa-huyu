import React from 'react';
import { observer } from 'mobx-react-lite';
import { TradeExecutionStore, DURATION_UNITS } from '../trade-execution-store';

type Props = { store: TradeExecutionStore };

const QUICK_STAKES = [5, 10, 25, 50, 100];

const TradeParameters = observer(({ store }: Props) => {
    const showLastDigit =
        store.tradeTypeTab === 'DIGITS' &&
        ['OVER_UNDER', 'MATCH_DIFFER'].includes(store.digitSubtype);

    const allowedDurationUnits = React.useMemo(() => {
        if (store.tradeTypeTab === 'DIGITS' || store.tradeTypeTab === 'RISE_FALL') {
            return DURATION_UNITS.filter(u => u.value === 't');
        }
        return DURATION_UNITS.filter(u => u.value !== 't');
    }, [store.tradeTypeTab]);

    return (
        <div className='dt-trade-params'>
            <div className='dt-trade-params__row'>
                <label className='dt-trade-params__label'>Duration</label>
                <div className='dt-trade-params__duration'>
                    <input
                        type='number'
                        min={1}
                        max={store.durationUnit === 't' ? 10 : 365}
                        value={store.duration}
                        onChange={e => store.setDuration(Number(e.target.value))}
                        className='dt-trade-params__duration-input'
                    />
                    <select
                        value={store.durationUnit}
                        onChange={e => store.setDurationUnit(e.target.value)}
                        className='dt-trade-params__duration-unit'
                    >
                        {allowedDurationUnits.map(u => (
                            <option key={u.value} value={u.value}>
                                {u.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='dt-trade-params__row'>
                <label className='dt-trade-params__label'>
                    Stake ({store.currency})
                </label>
                <div className='dt-trade-params__stake'>
                    <span className='dt-trade-params__stake-symbol'>$</span>
                    <input
                        type='number'
                        min={0.35}
                        step={0.01}
                        value={store.stake}
                        onChange={e => store.setStake(e.target.value)}
                        className='dt-trade-params__stake-input'
                    />
                </div>
                <div className='dt-trade-params__quick-stakes'>
                    {QUICK_STAKES.map(s => (
                        <button
                            key={s}
                            type='button'
                            className={`dt-trade-params__quick-stake${Number(store.stake) === s ? ' dt-trade-params__quick-stake--active' : ''}`}
                            onClick={() => store.setStake(String(s))}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {showLastDigit && (
                <div className='dt-trade-params__row'>
                    <label className='dt-trade-params__label'>
                        Last Digit Prediction
                    </label>
                    <div className='dt-trade-params__digits'>
                        {Array.from({ length: 10 }, (_, i) => (
                            <button
                                key={i}
                                type='button'
                                className={`dt-trade-params__digit${store.lastDigit === i ? ' dt-trade-params__digit--active' : ''}`}
                                onClick={() => store.setLastDigit(i)}
                            >
                                {i}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

export default TradeParameters;
