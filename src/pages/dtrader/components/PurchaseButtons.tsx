import React from 'react';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { TradeExecutionStore, CONTRACT_TYPE_LABELS } from '../trade-execution-store';

type Props = { store: TradeExecutionStore };

const BUTTON_COLORS: Record<string, string> = {
    CALL: 'rise',
    PUT: 'fall',
    DIGITOVER: 'rise',
    DIGITUNDER: 'fall',
    DIGITEVEN: 'rise',
    DIGITODD: 'fall',
    DIGITMATCH: 'rise',
    DIGITDIFF: 'fall',
    ONETOUCH: 'rise',
    NOTOUCH: 'fall',
};

const formatPrice = (price: number, currency: string) => {
    if (!price || isNaN(price)) return '...';
    return `${price.toFixed(2)} ${currency}`;
};

const PurchaseButtons = observer(({ store }: Props) => {
    const { currentContracts, proposalInfo, currency, isPurchasing, purchaseResult, error } = store;

    return (
        <div className='dt-purchase'>
            {error && (
                <div className='dt-purchase__error'>
                    <span>{error}</span>
                    <button
                        type='button'
                        onClick={() => runInAction(() => { store.error = null; })}
                        className='dt-purchase__error-close'
                    >
                        ✕
                    </button>
                </div>
            )}

            {purchaseResult && !isPurchasing && (
                <div className='dt-purchase__result'>
                    <span>✓ Contract #{purchaseResult.contract_id} purchased</span>
                    <span>
                        {purchaseResult.buy_price.toFixed(2)} {currency} →{' '}
                        {purchaseResult.payout.toFixed(2)} {currency}
                    </span>
                </div>
            )}

            <div className='dt-purchase__buttons'>
                {currentContracts.map((contractType, idx) => {
                    const info = proposalInfo[contractType];
                    const label = CONTRACT_TYPE_LABELS[contractType] || contractType;
                    const colorClass = BUTTON_COLORS[contractType] || (idx === 0 ? 'rise' : 'fall');
                    const payout = info && !info.has_error ? info.payout : null;
                    const hasError = info?.has_error;
                    const isLoading = isPurchasing;

                    return (
                        <button
                            key={contractType}
                            type='button'
                            className={`dt-purchase__btn dt-purchase__btn--${colorClass}${isLoading ? ' dt-purchase__btn--loading' : ''}${hasError ? ' dt-purchase__btn--error' : ''}`}
                            disabled={isLoading || hasError || !info}
                            onClick={() => store.purchase(contractType)}
                        >
                            {isLoading ? (
                                <span className='dt-purchase__spinner' />
                            ) : (
                                <>
                                    <span className='dt-purchase__btn-label'>{label}</span>
                                    {payout !== null && (
                                        <span className='dt-purchase__btn-payout'>
                                            Payout: {formatPrice(payout, currency)}
                                        </span>
                                    )}
                                    {hasError && (
                                        <span className='dt-purchase__btn-error'>
                                            {info?.error_code === 'ContractBuyValidationError'
                                                ? 'Invalid params'
                                                : 'Unavailable'}
                                        </span>
                                    )}
                                    {!info && <span className='dt-purchase__btn-loading-text'>Loading...</span>}
                                </>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
});

export default PurchaseButtons;
