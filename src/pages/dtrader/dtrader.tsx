import React from 'react';
import IframeWrapper from '@/components/iframe-wrapper';

const Dtrader: React.FC = () => (
    <IframeWrapper
        src='/dtrader-proxy'
        title='DTrader'
        className='dtrader-container'
    />
);

export default Dtrader;
