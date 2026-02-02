import React, { lazy, Suspense, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation, useNavigate } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateOAuthURL } from '@/components/shared';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import Dialog from '@/components/shared_ui/dialog';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import { DBOT_TABS, TAB_IDS } from '@/constants/bot-contents';
import { api_base, updateWorkspaceName } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { handleOidcAuthFailure } from '@/utils/auth-utils';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
    LabelPairedPlayCaptionBoldIcon, // Added for new tab icon
} from '@deriv/quill-icons/LabelPaired';
import { LegacyChartsIcon, LegacyGuide1pxIcon, LegacyIndicatorsIcon } from '@deriv/quill-icons/Legacy';
import { requestOidcAuthentication } from '@deriv-com/auth-client';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import SpeedBotFloatingStop from '../../components/speedbot-floating-stop';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import OverUnder from '../OverUnder'; // <--- Import your new tool
import './main.scss';

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));
const TradingView = lazy(() => import('../tradingview'));
const AnalysisTools = lazy(() => import('../analysis-tool'));
const CopyTrading = lazy(() => import('../copy-trading'));
const Strategies = lazy(() => import('../free-bots/strategies'));
const ProTool = lazy(() => import('../pro-tool'));
const Dtrader = lazy(() => import('../dtrader'));
import TradingBots from '../free-bots/trading-bots';

const AppWrapper = observer(() => {
    const { connectionStatus } = useApiBase();
    const { dashboard, load_modal, run_panel, quick_strategy, summary_card } = useStore();
    const {
        active_tab,
        active_tour,
        is_chart_modal_visible,
        is_trading_view_modal_visible,
        setActiveTab,
        setWebSocketState,
        setActiveTour,
        setTourDialogVisibility,
    } = dashboard;
    const { dashboard_strategies } = load_modal;
    const {
        is_dialog_open,
        is_drawer_open,
        dialog_options,
        onCancelButtonClick,
        onCloseDialog,
        onOkButtonClick,
        stopBot,
    } = run_panel;
    const { is_open } = quick_strategy;
    const { cancel_button_text, ok_button_text, title, message, dismissable, is_closed_on_cancel } = dialog_options as {
        [key: string]: string;
    };
    const { clear } = summary_card;
    const { DASHBOARD, BOT_BUILDER, STRATEGIES, TRADING_BOTS } = DBOT_TABS;
    const init_render = React.useRef(true);

    // 1. ADDED 'over_under' TO THE HASH ARRAY
    const hash = [
        'dashboard',
        'bot_builder',
        'chart',
        'trading_bots',
        'analysis_tool',
        'strategies',
        'copy_trading',
        'dtrader',
        'tradingview',
        'over_under', 
    ];
    
    const { isDesktop } = useDevice();
    const location = useLocation();
    const navigate = useNavigate();

    let tab_value: number | string = active_tab;
    const GetHashedValue = (tab: number) => {
        tab_value = location.hash?.split('#')[1];
        if (!tab_value) return tab;
        return Number(hash.indexOf(String(tab_value)));
    };
    const active_hash_tab = GetHashedValue(active_tab);

    const { onRenderTMBCheck, isTmbEnabled } = useTMB();

    React.useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    React.useEffect(() => {
        if (is_open) {
            setTourDialogVisibility(false);
        }

        if (init_render.current) {
            const tabToSet = location.hash ? Number(active_hash_tab) : DBOT_TABS.BOT_BUILDER;
            setActiveTab(tabToSet);
            if (!isDesktop) handleTabChange(tabToSet);
            if (!location.hash) {
                navigate(`#${hash[tabToSet] || hash[DBOT_TABS.BOT_BUILDER]}`);
            }
            init_render.current = false;
        } else {
            navigate(`#${hash[active_tab] || hash[DBOT_TABS.BOT_BUILDER]}`);
        }
        if (active_tour !== '') {
            setActiveTour('');
        }

        const mainElement = document.querySelector('.main__container');
        if (active_tab === DBOT_TABS.TUTORIAL && !isDesktop) {
            document.body.style.overflow = 'hidden';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.add('no-scroll');
            }
        } else {
            document.body.style.overflow = '';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.remove('no-scroll');
            }
        }
    }, [active_tab]);

    React.useEffect(() => {
        const trashcan_init_id = setTimeout(() => {
            if (active_tab === BOT_BUILDER && Blockly?.derivWorkspace?.trashcan) {
                const trashcanY = window.innerHeight - 250;
                let trashcanX;
                if (is_drawer_open) {
                    trashcanX = isDbotRTL() ? 380 : window.innerWidth - 460;
                } else {
                    trashcanX = isDbotRTL() ? 20 : window.innerWidth - 100;
                }
                Blockly?.derivWorkspace?.trashcan?.setTrashcanPosition(trashcanX, trashcanY);
            }
        }, 100);

        return () => {
            clearTimeout(trashcan_init_id);
        };
    }, [active_tab, is_drawer_open]);

    const handleTabChange = React.useCallback(
        (tab_index: number) => {
            setActiveTab(tab_index);
            const el_id = hash[tab_index]; // Uses the hash as ID
            if (el_id) {
                const el_tab = document.getElementById(el_id);
                setTimeout(() => {
                    el_tab?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }, 10);
            }
        },
        [active_tab]
    );

    const { isOAuth2Enabled } = useOauth2();
    const handleLoginGeneration = async () => {
        if (!isOAuth2Enabled) {
            window.location.replace(generateOAuthURL());
        } else {
            const getQueryParams = new URLSearchParams(window.location.search);
            const currency = getQueryParams.get('account') ?? '';
            const query_param_currency = currency || sessionStorage.getItem('query_param_currency') || 'USD';

            try {
                const tmbEnabled = await isTmbEnabled();
                if (tmbEnabled) {
                    await onRenderTMBCheck();
                } else {
                    try {
                        await requestOidcAuthentication({
                            redirectCallbackUri: `${window.location.origin}/callback`,
                            ...(query_param_currency
                                ? {
                                      state: {
                                          account: query_param_currency,
                                      },
                                  }
                                : {}),
                        });
                    } catch (err) {
                        handleOidcAuthFailure(err);
                    }
                }
            } catch (error) {
                console.error(error);
            }
        }
    };

    return (
        <React.Fragment>
            <div className='main'>
                <div
                    className={classNames('main__container', {
                        'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop,
                    })}
                >
                    <div>
                        <Tabs active_index={active_tab} className='main__tabs' onTabItemClick={handleTabChange} top>
                            <div
                                label={
                                    <>
                                        <LabelPairedObjectsColumnCaptionRegularIcon height='24px' width='24px' fill='var(--text-general)' />
                                        <Localize i18n_default_text='Dashboard' />
                                    </>
                                }
                                id='id-dbot-dashboard'
                            >
                                <Dashboard handleTabChange={handleTabChange} />
                            </div>
                            <div
                                label={
                                    <>
                                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon height='24px' width='24px' fill='var(--text-general)' />
                                        <Localize i18n_default_text='Bot Builder' />
                                    </>
                                }
                                id='id-bot-builder'
                            />
                            {/* ... other tabs ... */}
                            <div
                                label={
                                    <>
                                        <LabelPairedChartLineCaptionRegularIcon height='24px' width='24px' fill='var(--text-general)' />
                                        <Localize i18n_default_text='Charts' />
                                    </>
                                }
                                id='id-charts'
                            >
                                <Suspense fallback={<ChunkLoader message={localize('Please wait, loading chart...')} />}>
                                    <ChartWrapper show_digits_stats={false} />
                                </Suspense>
                            </div>
                            
                            {/* 2. INSERTED THE OVER/UNDER TAB BUTTON HERE */}
                            <div
                                label={
                                    <>
                                        <LabelPairedPlayCaptionBoldIcon height='24px' width='24px' fill='var(--text-general)' />
                                        <Localize i18n_default_text='Over/Under Tool' />
                                    </>
                                }
                                id='over_under'
                            >
                                <OverUnder />
                            </div>

                            <div
                                label={
                                    <>
                                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon height='24px' width='24px' fill='var(--text-general)' />
                                        <Localize i18n_default_text='Trading Bots' />
                                    </>
                                }
                                id='id-trading-bots'
                            >
                                <TradingBots />
                            </div>
                            {/* Keep remaining original tabs (Analysis Tool, Strategies, etc.) */}
                        </Tabs>
                    </div>
                </div>
            </div>
            <DesktopWrapper>
                {active_tab !== DBOT_TABS.DTRADER && hash[active_tab] !== 'over_under' && (
                    <div className='main__run-strategy-wrapper'>
                        {active_tab !== DBOT_TABS.TRADING_BOTS && <RunStrategy />}
                        <RunPanel />
                    </div>
                )}
                <ChartModal />
                <TradingViewModal />
            </DesktopWrapper>
            <MobileWrapper>{!is_open && active_tab !== DBOT_TABS.STRATEGIES && <RunPanel />}</MobileWrapper>
            <SpeedBotFloatingStop />
        </React.Fragment>
    );
});

export default AppWrapper;
