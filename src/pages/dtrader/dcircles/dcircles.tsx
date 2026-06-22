import React from 'react';
import IframeWrapper from '@/components/iframe-wrapper';
import './dcircles.scss';

const Dcircles = () => {
    return (
        <div className='dcircles'>
            <IframeWrapper
                src='https://bot-analysis-tool-belex.web.app'
                title='Bot Analysis Tool'
                className='dcircles-container'
            />
        </div>
    );
};

export default Dcircles;
