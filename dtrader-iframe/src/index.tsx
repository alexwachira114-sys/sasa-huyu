/* eslint-disable import/no-named-as-default-member */
/* eslint-disable import/no-named-as-default */
import ReactDOM from 'react-dom';
import React from 'react';
import 'promise-polyfill';
import initStore from 'App/initStore';
import App from 'App/app.jsx';
import { checkAndSetEndpointFromUrl } from '@deriv/shared';
import AppNotificationMessages from './App/Containers/app-notification-messages.jsx';

const has_endpoint_url = checkAndSetEndpointFromUrl();

if (!has_endpoint_url) {
    const root_store = initStore(AppNotificationMessages);
    const wrapper = document.getElementById('deriv_app');
    if (wrapper) {
        ReactDOM.render(<App useSuspense={false} root_store={root_store} />, wrapper);
    }
}
