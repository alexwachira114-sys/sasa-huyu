import React from 'react';

import { observer, useStore } from '@deriv/stores';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { useTranslations } from '@deriv-com/translations';

import BinarytoolBranding from './Components/Elements/BinarytoolBranding';
import ErrorBoundary from './Components/Elements/Errors/error-boundary.jsx';
import LandscapeBlocker from './Components/Elements/LandscapeBlocker';
import AppToastMessages from './Containers/app-toast-messages.jsx';
import AppContents from './Containers/Layout/app-contents.jsx';
import AppModals from './Containers/Modals';
import Routes from './Containers/Routes/routes.jsx';
import Devtools from './Devtools';

const AppContent: React.FC<{ passthrough: unknown }> = observer(({ passthrough }) => {
    const store = useStore();
    const { is_dark_mode_on } = store.ui;
    const { current_language } = store.common;
    const { switchLanguage } = useTranslations();

    React.useEffect(() => {
        switchLanguage(current_language);
    }, [current_language, switchLanguage]);

    return (
        <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
            <LandscapeBlocker />
            <ErrorBoundary root_store={store}>
                <AppContents>
                    <Routes passthrough={passthrough} />
                </AppContents>
            </ErrorBoundary>
            <ErrorBoundary root_store={store}>
                <AppModals />
            </ErrorBoundary>
            <AppToastMessages />
            <BinarytoolBranding />
            <Devtools />
        </ThemeProvider>
    );
});

export default AppContent;
