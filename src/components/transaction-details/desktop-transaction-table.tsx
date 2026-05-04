import { ReactElement } from 'react';
import classNames from 'classnames';
import ContentLoader from 'react-content-loader';
import { transaction_elements } from '@/constants/transactions';
import { getContractTypeName } from '@/external/bot-skeleton';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { MarketIcon } from '../market/market-icon';
import { convertDateFormat } from '../shared';
import Popover from '../shared_ui/popover';
import { TradeTypeIcon } from '../trade-type/trade-type-icon';
import { TColumn, TDesktopTransactionTable, TTableCell } from './transaction-details.types';

const PARENT_CLASS = 'transaction-details-modal-desktop';

const TableCell = ({ label, extra_classes = [], loader = false }: TTableCell) => {
    return (
        <div className={classNames(`${PARENT_CLASS}__table-cell`, ...extra_classes)}>
            {loader ? <CellLoader /> : label}
        </div>
    );
};

const TableHeader = ({ columns }: { columns: TColumn[] }) => (
    <div className={classNames(`${PARENT_CLASS}__table-row`, `${PARENT_CLASS}__table-header`)}>
        {columns?.map(column => (
            <TableCell
                key={column.key}
                extra_classes={[column.extra_class ? `${PARENT_CLASS}__table-cell${column.extra_class}` : '']}
                label={column.label}
                loader={false}
            />
        ))}
    </div>
);

const IconWrapper = ({ message, icon }: { message: string; icon: ReactElement }) => (
    <div className={`${PARENT_CLASS}__icon-wrapper`}>
        <Popover alignment={isDbotRTL() ? 'right' : 'left'} message={message} zIndex='9999'>
            {icon}
        </Popover>
    </div>
);

const CellLoader = () => (
    <ContentLoader
        className='transactions__loader-text'
        data-testid='transaction_details_table_cell_loader'
        height={10}
        width={30}
        speed={3}
        backgroundColor={'var(--general-section-2)'}
        foregroundColor={'var(--general-hover)'}
    >
        <rect x='0' y='0' rx='0' ry='0' width='60' height='12' />
    </ContentLoader>
);

export default function DesktopTransactionTable({
    result,
    result_columns,
    transactions,
    transaction_columns,
    account,
    balance,
}: TDesktopTransactionTable) {
    return (
        <div data-testid='transaction_details_tables' className='transaction-details-tables'>
            <div
                className={classNames(
                    `${PARENT_CLASS}__table-container`,
                    `${PARENT_CLASS}__table-container__top-table`
                )}
            >
                <TableHeader columns={transaction_columns} />
                {transactions?.map((transaction, index) => {
                    const { data, type } = transaction;
                    if (type === transaction_elements.CONTRACT && data) {
                        const contract_data = data as any;
                        const buy_id = contract_data?.display_transaction_ids?.buy ?? contract_data?.transaction_ids?.buy ?? `virtual-${index}`;
                        
                        return (
                            <div className={`${PARENT_CLASS}__table-row`} key={buy_id}>
                                <TableCell
                                    label={
                                        contract_data?.date_start ?
                                        convertDateFormat(
                                            contract_data?.date_start,
                                            'YYYY-M-D HH:mm:ss [GMT]',
                                            'YYYY-MM-DD HH:mm:ss [GMT]'
                                        ) : ''
                                    }
                                    extra_classes={[`${PARENT_CLASS}__table-cell--grow-big`]}
                                />
                                <TableCell
                                    label={buy_id}
                                    extra_classes={[`${PARENT_CLASS}__table-cell--grow-mid`]}
                                />
                                <TableCell
                                    label={
                                        <IconWrapper
                                            message={contract_data?.display_name ?? ''}
                                            icon={<MarketIcon type={contract_data?.underlying} size='sm' />}
                                        />
                                    }
                                />
                                <TableCell
                                    label={
                                        <IconWrapper
                                            message={getContractTypeName(contract_data)}
                                            icon={<TradeTypeIcon type={contract_data?.contract_type} size='sm' />}
                                        />
                                    }
                                />
                                <TableCell label={contract_data?.entry_tick} loader={!contract_data?.entry_tick} />
                                <TableCell label={contract_data?.exit_tick} loader={!contract_data?.exit_tick} />
                                <TableCell label={Math.abs(contract_data?.buy_price ?? 0).toFixed(2)} />
                                <TableCell
                                    label={
                                        <div
                                            className={classNames({
                                                [`${PARENT_CLASS}__profit--win`]: contract_data?.profit > 0,
                                                [`${PARENT_CLASS}__profit--loss`]: contract_data?.profit < 0,
                                            })}
                                        >
                                            {Math.abs(contract_data?.profit ?? 0).toFixed(2)}
                                        </div>
                                    }
                                    loader={!contract_data?.is_completed}
                                />
                            </div>
                        );
                    }

                    return (
                        <div className={`${PARENT_CLASS}__table-row`} key={`transaction-row-divider-${index}`}>
                            <div className={`${PARENT_CLASS}__divider`}>
                                <div className='transactions__divider-line' />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div
                className={classNames(
                    `${PARENT_CLASS}__table-container`,
                    `${PARENT_CLASS}__table-container__bottom-table`
                )}
            >
                <TableHeader columns={result_columns} />
                <div className={`${PARENT_CLASS}__table-row`}>
                    <TableCell label={account} extra_classes={[`${PARENT_CLASS}__table-cell--grow-mid`]} />
                    <TableCell label={result?.number_of_runs} />
                    <TableCell label={Math.abs(result?.total_stake ?? 0).toFixed(2)} />
                    <TableCell label={Math.abs(result?.total_payout ?? 0).toFixed(2)} />
                    <TableCell label={result?.won_contracts} />
                    <TableCell label={result?.lost_contracts} extra_classes={[`${PARENT_CLASS}__loss`]} />
                    <TableCell
                        label={
                            <div
                                className={classNames(
                                    result?.total_profit && {
                                        [`${PARENT_CLASS}__profit--win`]: result?.total_profit > 0,
                                        [`${PARENT_CLASS}__profit--loss`]: result?.total_profit < 0,
                                    }
                                )}
                                data-testid='transaction_details_table_profit'
                            >
                                {Math.abs(result?.total_profit ?? 0).toFixed(2)}
                            </div>
                        }
                    />
                    <TableCell label={balance} />
                </div>
            </div>
        </div>
    );
}
