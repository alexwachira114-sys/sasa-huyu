import { extractInfoFromShortcode, isHighLow } from '../shortcode';
import { getMarketName, getTradeTypeName } from './market-underlying';

export const getTradeNotificationMessage = (shortcode: string) => {
    const extracted_info_from_shortcode = extractInfoFromShortcode(shortcode);
    const symbol = getMarketName(extracted_info_from_shortcode.underlying);
    const trade_type = extracted_info_from_shortcode.category;
    const contract_type = getTradeTypeName(trade_type, {
        isHighLow: isHighLow({ shortcode }),
        showMainTitle: true,
    });
    const contract_type_with_subtype = `${contract_type} ${getTradeTypeName(trade_type, {
        isHighLow: isHighLow({ shortcode }),
    })}`.trim();

    return `${contract_type_with_subtype} - ${symbol}`;
};
