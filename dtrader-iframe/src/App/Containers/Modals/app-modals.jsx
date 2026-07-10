import React from 'react';
import { useLocation } from 'react-router-dom';

import { moduleLoader } from '@deriv/shared';
import { observer, useStore } from '@deriv/stores';

import RedirectNoticeModal from 'App/Components/Elements/Modals/RedirectNotice';

const UrlUnavailableModal = React.lazy(() =>
    moduleLoader(() => import(/* webpackChunkName: "url-unavailable-modal" */ '../UrlUnavailableModal'))
);
const ResetOrUnlinkPasswordModal = React.lazy(() =>
    moduleLoader(() => import(/* webpackChunkName: "reset-or-unlink-password-modal" */ '../ResetOrUnlinkPasswordModal'))
);
const UnlinkPasswordModal = React.lazy(
    () => import(/* webpackChunkName: "reset-or-unlink-password-modal" */ '../UnlinkPasswordModal')
);
const RedirectToLoginModal = React.lazy(() =>
    moduleLoader(() => import(/* webpackChunkName: "reset-password-modal" */ '../RedirectToLoginModal'))
);
const ResetEmailModal = React.lazy(() => import(/* webpackChunkName: "reset-email-modal" */ '../ResetEmailModal'));
const UpdateEmailModal = React.lazy(() => import(/* webpackChunkName: "update-email-modal" */ '../UpdateEmailModal'));

const AppModals = observer(() => {
    const { client, ui } = useStore();
    const { is_logged_in } = client;
    const { isUrlUnavailableModalVisible } = ui;

    const url_params = new URLSearchParams(useLocation().search);
    const url_action_param = url_params.get('action');

    let ComponentToLoad = null;

    switch (url_action_param) {
        case 'redirect_to_login':
            ComponentToLoad = <RedirectToLoginModal />;
            break;
        case 'reset_password':
            ComponentToLoad = <ResetOrUnlinkPasswordModal />;
            break;
        case 'social_email_change':
            ComponentToLoad = <UnlinkPasswordModal />;
            break;
        case 'request_email':
            ComponentToLoad = <ResetEmailModal />;
            break;
        case 'system_email_change':
            ComponentToLoad = <UpdateEmailModal />;
            break;
        default:
            if (isUrlUnavailableModalVisible) {
                ComponentToLoad = <UrlUnavailableModal />;
            }
            break;
    }

    return (
        <>
            <RedirectNoticeModal is_logged_in={is_logged_in} is_eu={false} portal_id='popup_root' />
            {ComponentToLoad ? <React.Suspense fallback={<div />}>{ComponentToLoad}</React.Suspense> : null}
        </>
    );
});

export default AppModals;
