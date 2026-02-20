import React, { useState, useEffect } from 'react';
import './AnimatedStatus.scss';

interface AnimatedStatusProps {
    status: string;
    subStatus: string;
}

const AnimatedStatus: React.FC<AnimatedStatusProps> = ({ status, subStatus }) => {
    const [animatedStatus, setAnimatedStatus] = useState('');
    const [animatedSubStatus, setAnimatedSubStatus] = useState('');

    useEffect(() => {
        let statusIndex = 0;
        const statusTimer = setInterval(() => {
            if (statusIndex < status.length) {
                setAnimatedStatus(prev => prev + status[statusIndex]);
                statusIndex++;
            } else {
                clearInterval(statusTimer);
            }
        }, 50);

        return () => clearInterval(statusTimer);
    }, [status]);

    useEffect(() => {
        let subStatusIndex = 0;
        const subStatusTimer = setInterval(() => {
            if (subStatusIndex < subStatus.length) {
                setAnimatedSubStatus(prev => prev + subStatus[subStatusIndex]);
                subStatusIndex++;
            } else {
                clearInterval(subStatusTimer);
            }
        }, 30);

        return () => clearInterval(subStatusTimer);
    }, [subStatus]);

    return (
        <div className='animated-status'>
            <div className='animated-status__line'>{animatedStatus}</div>
            <div className='animated-status__sub'>{animatedSubStatus}</div>
        </div>
    );
};

export default AnimatedStatus;
