import React from 'react';
import { Redirect as RouterRedirect } from 'react-router-dom';

import { routes } from '@deriv/shared';
import { localize } from '@deriv/translations';

import Redirect from 'App/Containers/Redirect';
import CallbackPage from '../../Modules/Callback/CallbackPage.tsx';

// Error Routes
const Page404 = React.lazy(() => import(/* webpackChunkName: "404" */ 'Modules/Page404'));

const Trader = React.lazy(() => import(/* webpackChunkName: "trader" */ '@deriv/trader'));

const legacy_dtrader_route = '/dtrader';
const legacy_dtrader_positions_route = '/dtrader/positions';

// Order matters
const initRoutesConfig = () => [
    {
        path: legacy_dtrader_positions_route,
        component: RouterRedirect,
        getTitle: () => '',
        to: routes.trader_positions,
    },
    { path: legacy_dtrader_route, component: RouterRedirect, getTitle: () => '', to: routes.trade, exact: true },
    { path: routes.index, component: RouterRedirect, getTitle: () => '', to: routes.trade },
    { path: routes.redirect, component: Redirect, getTitle: () => localize('Redirect') },
    { path: routes.callback_page, component: CallbackPage, getTitle: () => 'Callback' },
    {
        path: routes.trade,
        component: Trader,
        getTitle: () => localize('Trader'),
        exact: true,
    },
    {
        path: routes.trader_positions,
        component: Trader,
        getTitle: () => localize('Positions'),
        is_authenticated: true,
    },
    {
        path: routes.contract,
        component: Trader,
        getTitle: () => localize('Contract Details'),
        is_authenticated: true,
    },
];

let routesConfig;

const route_default = { component: Page404, getTitle: () => localize('Error 404') };

const getRoutesConfig = () => {
    if (!routesConfig) {
        routesConfig = initRoutesConfig();
        routesConfig.push(route_default);
    }
    return routesConfig;
};

export default getRoutesConfig;
