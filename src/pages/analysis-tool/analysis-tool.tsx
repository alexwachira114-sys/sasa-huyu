import React from 'react';
import IframeWrapper from '@/components/iframe-wrapper';
import './analysis-tool.scss';

const AnalysisTool = () => {
    return (
        <div className='dcircles'>
            {/* Load local copy so styling changes in /public/circles are used during development */}
            <IframeWrapper src='/circles/index.html' title='Dcircles' className='dcircles-container' />
        </div>
    );
};

export default AnalysisTool;
