import React from 'react';
import classNames from 'classnames';
import Text from '../text/text';

export type TLoadingProps = React.HTMLProps<HTMLDivElement> & {
    is_fullscreen: boolean;
    is_slow_loading: boolean;
    status: string[];
    theme: string;
};

const loading_quotes = [
    'Plan the trade. Let the price come to you.',
    'Risk stays small. Patience does the heavy lifting.',
    'Clean entries beat busy charts.',
    'Wait for confirmation, then execute without hesitation.',
];

const RingSpinner = () => (
    <svg className='initial-loader__ring-svg' viewBox='25 25 50 50' aria-hidden='true'>
        <circle cx='50' cy='50' r='20' />
    </svg>
);

const Loading = ({ className, id, is_fullscreen = true, is_slow_loading, status, theme }: Partial<TLoadingProps>) => {
    const should_show_compact_spinner = !is_fullscreen || className?.includes('initial-loader--btn');
    const [quote_index, setQuoteIndex] = React.useState(0);

    React.useEffect(() => {
        if (should_show_compact_spinner) return undefined;
        const timer = window.setInterval(() => {
            setQuoteIndex(i => (i + 1) % loading_quotes.length);
        }, 2800);
        return () => window.clearInterval(timer);
    }, [should_show_compact_spinner]);

    if (should_show_compact_spinner) {
        return (
            <div
                data-testid='dt_initial_loader'
                className={classNames('initial-loader', { 'initial-loader--fullscreen': is_fullscreen }, className)}
            >
                <div id={id} className='initial-loader__ring'>
                    <RingSpinner />
                </div>
                {is_slow_loading &&
                    status?.map((text, i) => (
                        <Text as='h3' color='prominent' size='xs' align='center' key={i}>
                            {text}
                        </Text>
                    ))}
            </div>
        );
    }

    return (
        <div
            data-testid='dt_initial_loader'
            className={classNames('initial-loader', 'initial-loader--market', {
                'initial-loader--fullscreen': is_fullscreen,
            }, className)}
        >
            <div id={id} className='initial-loader__market-center' role='status' aria-live='polite'>
                <div className='initial-loader__logo-area' aria-hidden='true'>
                    <div className='initial-loader__pulse-ring initial-loader__pulse-ring--1' />
                    <div className='initial-loader__pulse-ring initial-loader__pulse-ring--2' />
                    <div className='initial-loader__ring initial-loader__ring--lg'>
                        <RingSpinner />
                    </div>
                    <div className='initial-loader__chart-bars' aria-hidden='true'>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} />
                        ))}
                    </div>
                </div>

                <Text as='h2' className='initial-loader__title' weight='bold' align='center'>
                    DTrader
                </Text>

                <div className='initial-loader__quote' key={quote_index} aria-live='polite'>
                    {loading_quotes[quote_index]}
                </div>

                {is_slow_loading &&
                    status?.map((text, i) => (
                        <Text as='h3' color='less-prominent' size='xs' align='center' key={i}>
                            {text}
                        </Text>
                    ))}
            </div>
        </div>
    );
};

export default Loading;
