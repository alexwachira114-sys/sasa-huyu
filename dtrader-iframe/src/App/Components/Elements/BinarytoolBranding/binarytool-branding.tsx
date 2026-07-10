import React from 'react';
import { useLocation } from 'react-router-dom';

import { isDtraderRoute } from '@deriv/shared';

import './binarytool-branding.scss';

const BRANDING_SECRET_KEY = 'bt_secret';
const BRANDING_SECRET_VALUE = 'binarytool';

const BinarytoolBranding = () => {
    const location = useLocation();
    const [has_message_secret, setHasMessageSecret] = React.useState(
        () => sessionStorage.getItem(BRANDING_SECRET_KEY) === BRANDING_SECRET_VALUE
    );
    const params = new URLSearchParams(location.search);
    const should_hide_branding = params.get(BRANDING_SECRET_KEY) === BRANDING_SECRET_VALUE || has_message_secret;

    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const data = event.data as { branding?: Record<string, string> };

            if (data?.branding?.[BRANDING_SECRET_KEY] !== BRANDING_SECRET_VALUE) return;

            sessionStorage.setItem(BRANDING_SECRET_KEY, BRANDING_SECRET_VALUE);
            setHasMessageSecret(true);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    if (!isDtraderRoute(location.pathname) || should_hide_branding) return null;

    return (
        <div className='binarytool-branding' aria-hidden='true'>
            <div className='binarytool-branding__watermark' aria-hidden='true'>
                Deriv Dtrader
            </div>
        </div>
    );
};

export default BinarytoolBranding;
