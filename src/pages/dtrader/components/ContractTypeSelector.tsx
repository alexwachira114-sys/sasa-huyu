import React from 'react';
import { observer } from 'mobx-react-lite';
import { TradeExecutionStore, TRADE_TYPE_TABS } from '../trade-execution-store';

type Props = { store: TradeExecutionStore };

const ContractTypeSelector = observer(({ store }: Props) => {
    return (
        <div className='dt-contract-selector'>
            <div className='dt-contract-selector__tabs'>
                {TRADE_TYPE_TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`dt-contract-selector__tab${store.tradeTypeTab === tab.id ? ' dt-contract-selector__tab--active' : ''}`}
                        onClick={() => store.setTradeTypeTab(tab.id)}
                        type='button'
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {store.tradeTypeTab === 'DIGITS' && (() => {
                const tab = TRADE_TYPE_TABS.find(t => t.id === 'DIGITS');
                return tab?.subtypes ? (
                    <div className='dt-contract-selector__subtabs'>
                        {tab.subtypes.map(sub => (
                            <button
                                key={sub.id}
                                className={`dt-contract-selector__subtab${store.digitSubtype === sub.id ? ' dt-contract-selector__subtab--active' : ''}`}
                                onClick={() => store.setDigitSubtype(sub.id)}
                                type='button'
                            >
                                {sub.label}
                            </button>
                        ))}
                    </div>
                ) : null;
            })()}
        </div>
    );
});

export default ContractTypeSelector;
