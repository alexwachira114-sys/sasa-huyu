import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { TradeExecutionStore, ActiveSymbol } from '../trade-execution-store';

type Props = { store: TradeExecutionStore };

const MarketSelector = observer(({ store }: Props) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = store.selectedSymbolInfo;
    const groups = store.groupedSymbols;

    const filtered = React.useMemo(() => {
        if (!search) return groups;
        const q = search.toLowerCase();
        const result: Record<string, ActiveSymbol[]> = {};
        Object.entries(groups).forEach(([g, syms]) => {
            const matching = syms.filter(
                s =>
                    s.display_name.toLowerCase().includes(q) ||
                    s.symbol.toLowerCase().includes(q)
            );
            if (matching.length) result[g] = matching;
        });
        return result;
    }, [groups, search]);

    return (
        <div className='dt-market-selector' ref={ref}>
            <button
                className='dt-market-selector__trigger'
                onClick={() => setOpen(o => !o)}
                type='button'
            >
                <span className='dt-market-selector__label'>
                    {selected ? selected.display_name : 'Select Market'}
                </span>
                <svg
                    className={`dt-market-selector__arrow${open ? ' dt-market-selector__arrow--open' : ''}`}
                    width='12'
                    height='8'
                    viewBox='0 0 12 8'
                >
                    <path d='M1 1l5 5 5-5' stroke='currentColor' strokeWidth='1.5' fill='none' />
                </svg>
            </button>

            {open && (
                <div className='dt-market-selector__dropdown'>
                    <div className='dt-market-selector__search'>
                        <input
                            autoFocus
                            type='text'
                            placeholder='Search markets...'
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className='dt-market-selector__search-input'
                        />
                    </div>
                    <div className='dt-market-selector__list'>
                        {Object.entries(filtered).map(([group, syms]) => (
                            <div key={group}>
                                <div className='dt-market-selector__group'>{group}</div>
                                {syms.map(sym => (
                                    <button
                                        key={sym.symbol}
                                        className={`dt-market-selector__item${store.symbol === sym.symbol ? ' dt-market-selector__item--active' : ''}`}
                                        onClick={() => {
                                            store.setSymbol(sym.symbol);
                                            setOpen(false);
                                            setSearch('');
                                        }}
                                        type='button'
                                    >
                                        <span>{sym.display_name}</span>
                                        <span className={`dt-market-selector__status${sym.exchange_is_open ? ' dt-market-selector__status--open' : ''}`} />
                                    </button>
                                ))}
                            </div>
                        ))}
                        {Object.keys(filtered).length === 0 && (
                            <div className='dt-market-selector__empty'>No markets found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default MarketSelector;
