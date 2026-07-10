import React from 'react';
import { useLocation, withRouter } from 'react-router';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import { ThemedScrollbars } from '@deriv/components';
import { platforms, redirectToLogin, routes } from '@deriv/shared';
import { observer, useStore } from '@deriv/stores';
import { getLanguage } from '@deriv/translations';
import { useDevice } from '@deriv-com/ui';

const AppContents = observer(({ children }) => {
    const {
        client,
        common: { platform, is_from_tradershub_os },
        ui,
    } = useStore();
    const { isDesktop, isMobile } = useDevice();
    const location = useLocation();

    const { is_logged_in, should_redirect_user_to_login, setShouldRedirectToLogin } = client;
    const {
        is_app_disabled,
        is_cashier_visible,
        is_cfd_page,
        is_positions_drawer_on,
        is_route_modal_on,
        notifyAppInstall,
        setAppContentsScrollRef,
    } = ui;

    const scroll_ref = React.useRef(null);
    const child_ref = React.useRef(null);

    React.useEffect(() => {
        if (should_redirect_user_to_login) {
            setShouldRedirectToLogin(false);
            redirectToLogin(is_logged_in, getLanguage());
        }
    }, [should_redirect_user_to_login, is_logged_in, setShouldRedirectToLogin]);

    React.useEffect(() => {
        if (scroll_ref.current) setAppContentsScrollRef(scroll_ref);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
        if (child_ref.current) {
            child_ref.current.scrollTop = 0;
        }
    }, [location?.pathname]);

    React.useEffect(() => {
        const handleInstallPrompt = e => {
            e.preventDefault();
            notifyAppInstall(e);
        };
        window.addEventListener('beforeinstallprompt', handleInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    }, [notifyAppInstall]);

    return (
        <div
            id='app_contents'
            className={classNames('app-contents', {
                'app-contents--show-positions-drawer': is_positions_drawer_on,
                'app-contents--is-disabled': is_app_disabled,
                'app-contents--is-mobile': isMobile,
                'app-contents--is-route-modal': is_route_modal_on,
                'app-contents--is-scrollable': is_cfd_page || is_cashier_visible,
                'app-contents--is-hidden': platforms[platform] && !(is_from_tradershub_os && isMobile),
                'app-contents--is-onboarding': window.location.pathname === routes.onboarding,
            })}
            ref={scroll_ref}
        >
            {isMobile && children}
            {!isMobile &&
                (window.location.pathname === routes.onboarding ? (
                    <ThemedScrollbars style={{ maxHeight: '', height: '100%' }} refSetter={child_ref}>
                        {children}
                    </ThemedScrollbars>
                ) : (
                    <ThemedScrollbars height={isDesktop ? '100vh' : undefined} has_horizontal refSetter={child_ref}>
                        {children}
                    </ThemedScrollbars>
                ))}
        </div>
    );
});

AppContents.propTypes = {
    children: PropTypes.any,
};

export default withRouter(AppContents);
