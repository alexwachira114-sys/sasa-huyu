import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import './iframe-wrapper.scss';
import { getMainAppActiveToken, getMainAppActiveLoginId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import { useStore } from '@/hooks/useStore';
import { contract_stages } from '@/constants/contract-stage';
import { sendViaNewSystemWithPromise, isNewLoggedIn } from '@/auth/NewDerivAuth';

interface IframeWrapperProps {
    src: string;
    title: string;
    className?: string;
    sandbox?: string;
}

const IframeWrapper: React.FC<IframeWrapperProps> = observer(({ src, title, className = '', sandbox }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { transactions, run_panel, client } = useStore();

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        // Verify stores are available
        if (!transactions || !run_panel) {
            console.warn(`⚠️ [${title}] Stores not available:`, {
                transactions: !!transactions,
                run_panel: !!run_panel,
                client: !!client,
            });
        } else {
            console.log(`✅ [${title}] Stores available:`, {
                transactions: !!transactions,
                run_panel: !!run_panel,
                client: !!client,
            });
        }

        // Function to send auth data to iframe
        const sendAuthData = () => {
            const token = getMainAppActiveToken();
            const loginid = getMainAppActiveLoginId();
            const appId = getAppId(); // Get the current app ID

            if (token && loginid && iframe.contentWindow) {
                try {
                    // Send auth token, loginid, and appId to iframe
                    iframe.contentWindow.postMessage(
                        {
                            type: 'AUTH_TOKEN',
                            token,
                            loginid,
                            appId, // Add appId to the message
                            timestamp: Date.now(),
                        },
                        '*'
                    );
                    console.log(
                        `🔐 [${title}] Sent auth token to iframe (loginid: ${loginid?.substring(0, 4)}..., appId: ${appId})`
                    );
                } catch (error) {
                    console.error('Error sending auth data to iframe:', error);
                }
            } else {
                console.warn(
                    `⚠️ [${title}] No auth token available to send (token: ${!!token}, loginid: ${!!loginid}, appId: ${!!appId})`
                );
            }
        };

        // Listen for messages from iframe (auth requests and trade events)
        const handleMessage = (event: MessageEvent) => {
            // Security: Optionally validate event.origin
            // if (event.origin !== 'https://hyperbot-indol.vercel.app') return;

            // Debug: Log all messages from iframe
            if (event.data && event.data.type) {
                console.log(`📨 [${title}] Received message from iframe:`, event.data.type, event.data);
            }

            if (!event.data || !event.data.type) return;

            // Handle auth requests
            if (event.data.type === 'REQUEST_AUTH') {
                console.log(`📨 [${title}] Received REQUEST_AUTH from iframe, sending auth token...`);
                sendAuthData();
                return;
            }

            // Handle trade events from Hyperbot iframe
            if (event.data.type === 'TRADE_PLACED' || event.data.type === 'CONTRACT_EVENT') {
                const tradeData = event.data;

                console.log(`📊 [${title}] Received trade event from iframe:`, tradeData);

                // Initialize run panel on first trade (like other bots do)
                if (run_panel && !run_panel.run_id) {
                    // Generate run_id based on title (e.g., "Hyperbot" -> "hyperbot", "Diffbot" -> "diffbot")
                    const botName = title.toLowerCase().replace(/\s+/g, '');
                    run_panel.run_id = `${botName}-${Date.now()}`;
                    run_panel.setIsRunning(true);
                    run_panel.setContractStage(contract_stages.STARTING);
                    console.log(`🚀 [${title}] Initialized run panel with run_id:`, run_panel.run_id);
                }

                // Add to transactions panel
                if (transactions?.onBotContractEvent && tradeData.contract_id) {
                    try {
                        const contractData = {
                            contract_id: tradeData.contract_id,
                            transaction_ids: {
                                buy: tradeData.transaction_id || tradeData.buy_transaction_id,
                            },
                            buy_price: tradeData.buy_price || tradeData.price || 0,
                            currency: tradeData.currency || client?.currency || 'USD',
                            contract_type:
                                tradeData.contract_type ||
                                (title.toLowerCase().includes('matches')
                                    ? 'DIGITMATCH'
                                    : title.toLowerCase().includes('diffbot')
                                      ? 'DIGITDIFF'
                                      : title.toLowerCase().includes('speedbot')
                                        ? 'DIGITUNDER'
                                        : 'DIGITUNDER'), // Default based on bot type (SpeedBot can use DIGITUNDER, DIGITOVER, DIGITEVEN, DIGITODD, DIGITMATCH, DIGITDIFF)
                            underlying: tradeData.underlying || tradeData.symbol || '',
                            display_name: tradeData.display_name || tradeData.underlying || tradeData.symbol || '',
                            date_start: tradeData.date_start || Math.floor(Date.now() / 1000),
                            status: tradeData.status || 'open',
                            is_virtual: tradeData.is_virtual || false,
                        };

                        console.log(`📝 [${title}] Calling onBotContractEvent with:`, contractData);
                        transactions.onBotContractEvent(contractData);
                        console.log(`✅ [${title}] Added trade to Run Panel:`, contractData.contract_id);

                        // Update run panel state
                        if (run_panel) {
                            run_panel.setHasOpenContract(true);
                            run_panel.setContractStage(contract_stages.PURCHASE_SENT);
                            // Open run panel drawer if not already open
                            if (!run_panel.is_drawer_open) {
                                run_panel.toggleDrawer(true);
                            }
                            // Switch to transactions tab
                            run_panel.setActiveTabIndex(1);
                        }

                        // Verify transaction was added
                        setTimeout(() => {
                            const transactionList = transactions?.transactions || [];
                            console.log(`🔍 [${title}] Current transactions count:`, transactionList.length);
                            const found = transactionList.find(
                                (t: any) => t.data?.contract_id === contractData.contract_id
                            );
                            if (found) {
                                console.log(`✅ [${title}] Transaction confirmed in store:`, found);
                            } else {
                                console.warn(`⚠️ [${title}] Transaction not found in store!`);
                            }
                        }, 100);
                    } catch (error) {
                        console.error(`❌ [${title}] Error adding trade to Run Panel:`, error);
                        console.error(`❌ [${title}] Error details:`, error instanceof Error ? error.stack : error);
                    }
                } else {
                    console.warn(`⚠️ [${title}] Cannot add trade - missing transactions store or contract_id`);
                    console.warn(
                        `⚠️ [${title}] transactions:`,
                        !!transactions,
                        'onBotContractEvent:',
                        !!transactions?.onBotContractEvent,
                        'contract_id:',
                        tradeData.contract_id
                    );
                }
                return;
            }

            // ── BUY_REQUEST: iframe delegates trade execution to the parent ──────
            // DTrader's socket_base.js intercepts WS.buy() / WS.buyAndSubscribe()
            // and posts BUY_REQUEST here instead of calling Deriv directly.
            // The parent holds the PKCE-authenticated OTP WebSocket and is the
            // single source of truth for trade execution.
            if (event.data.type === 'BUY_REQUEST') {
                // Security: only accept BUY_REQUEST from our own iframe, not from
                // any other page or cross-origin actor.
                if (!iframe?.contentWindow || event.source !== iframe.contentWindow) {
                    console.warn(`⚠️ [${title}] BUY_REQUEST from unexpected source — ignored.`);
                    return;
                }

                const { reqId, payload } = event.data as { reqId: string; payload: Record<string, unknown> };

                // Validate required fields before doing anything with money.
                const replyError = (code: string, message: string) => {
                    iframe.contentWindow?.postMessage(
                        { type: 'BUY_RESULT', reqId, payload: { error: { code, message } } },
                        '*'
                    );
                };

                if (typeof reqId !== 'string' || !reqId) {
                    console.warn(`⚠️ [${title}] BUY_REQUEST missing reqId — ignored.`);
                    return; // Can't reply without a reqId
                }
                if (!payload || typeof payload !== 'object') {
                    replyError('InvalidPayload', 'BUY_REQUEST payload is missing or not an object.');
                    return;
                }

                const hasBuyField     = 'buy' in payload && payload.buy !== undefined && payload.buy !== '';
                const hasProposalId   = 'proposal_id' in payload && payload.proposal_id !== undefined && payload.proposal_id !== '';
                const hasPrice        = 'price' in payload && payload.price !== undefined;

                if (!hasBuyField && !hasProposalId) {
                    replyError('InvalidPayload', 'BUY_REQUEST must include either "buy" (proposal_id) or "proposal_id".');
                    return;
                }
                if (!hasPrice) {
                    replyError('InvalidPayload', 'BUY_REQUEST must include "price".');
                    return;
                }

                console.log(`🛒 [${title}] BUY_REQUEST received from iframe (reqId=${reqId}):`, payload);

                if (!isNewLoggedIn()) {
                    // Not a PKCE session — reject so the iframe can handle it via its own WS.
                    console.warn(`⚠️ [${title}] Not PKCE session; rejecting BUY_REQUEST.`);
                    replyError('NotPKCE', 'Parent is not PKCE-authenticated; cannot execute trade.');
                    return;
                }

                // Build the buy request.  The payload from the iframe may arrive as:
                //   { buy: proposal_id, price, ... }   (from buyAndSubscribe / raw buy)
                //   { proposal_id, price, ... }         (from buy({ proposal_id, price }))
                const buyRequest: Record<string, unknown> = { ...payload };
                if (!hasBuyField && hasProposalId) {
                    buyRequest.buy = payload.proposal_id;
                    delete buyRequest.proposal_id;
                }

                sendViaNewSystemWithPromise(buyRequest)
                    .then((result: unknown) => {
                        console.log(`✅ [${title}] BUY_RESULT → iframe (reqId=${reqId}):`, result);
                        iframe.contentWindow?.postMessage({ type: 'BUY_RESULT', reqId, payload: result }, '*');

                        // Mirror the trade into the Run Panel so it appears in the
                        // transactions list — same logic as TRADE_PLACED handling.
                        const res      = result as Record<string, unknown> | null | undefined;
                        const buyResp  = res?.buy as Record<string, unknown> | undefined;
                        if (buyResp?.contract_id && transactions?.onBotContractEvent) {
                            try {
                                transactions.onBotContractEvent({
                                    contract_id:     buyResp.contract_id,
                                    transaction_ids: { buy: buyResp.transaction_id as string | undefined },
                                    buy_price:       (buyResp.buy_price ?? buyResp.price ?? 0),
                                    currency:        (buyResp.currency as string | undefined) ?? client?.currency ?? 'USD',
                                    contract_type:   (buyResp.contract_type as string | undefined) ?? '',
                                    underlying:      String(buyResp.underlying_symbol ?? buyResp.symbol ?? ''),
                                    display_name:    String(buyResp.display_name ?? buyResp.underlying_symbol ?? ''),
                                    date_start:      (buyResp.date_start as number | undefined) ?? Math.floor(Date.now() / 1000),
                                    status:          'open',
                                    is_virtual:      false,
                                });
                                if (run_panel) {
                                    run_panel.setHasOpenContract(true);
                                    run_panel.setContractStage(contract_stages.PURCHASE_SENT);
                                    if (!run_panel.is_drawer_open) run_panel.toggleDrawer(true);
                                    run_panel.setActiveTabIndex(1);
                                }
                            } catch (err) {
                                console.warn(`⚠️ [${title}] Could not mirror trade to Run Panel:`, err);
                            }
                        }
                    })
                    .catch((err: unknown) => {
                        console.error(`❌ [${title}] BUY trade failed (reqId=${reqId}):`, err);
                        iframe.contentWindow?.postMessage({ type: 'BUY_RESULT', reqId, payload: err }, '*');
                    });
                return;
            }

            // Handle contract updates (when trades complete)
            if (event.data.type === 'CONTRACT_UPDATE') {
                const updateData = event.data;

                console.log(`🔄 [${title}] Received contract update from iframe:`, updateData);

                // The transactions store should automatically update when contract completes
                // But we can trigger a refresh if needed
                if (updateData.contract_id && transactions) {
                    // The store will handle updates via contract subscriptions
                    // This is mainly for logging
                }
                return;
            }
        };

        window.addEventListener('message', handleMessage);

        // Send auth data when iframe loads
        const handleLoad = () => {
            console.log('✅ Iframe loaded successfully:', src);
            // Immediately set loading to false so iframe becomes interactive
            setIsLoading(false);
            setHasError(false);
            // Wait a bit for iframe to be ready
            setTimeout(() => {
                sendAuthData();
                // Ensure loading is false
                setIsLoading(false);
                // Check if iframe has content
                try {
                    if (iframe.contentWindow) {
                        console.log('✅ Iframe contentWindow accessible');
                        // Check if iframe actually has content (not just blank)
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                                const body = iframeDoc.body;
                                if (body && body.innerHTML.trim() === '') {
                                    console.warn(
                                        '⚠️ Iframe loaded but body is empty - might be blocked or downloading'
                                    );
                                }
                            }
                        } catch (e) {
                            // Cross-origin, can't access - this is normal
                            console.log('ℹ️ Cross-origin iframe (cannot check content directly)');
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Cannot access iframe contentWindow (cross-origin):', e);
                }
            }, 500);
        };

        // Handle iframe errors
        const handleError = () => {
            console.error('❌ Iframe failed to load:', src);
            console.error('💡 This might indicate the site is blocking iframe embedding or serving downloads');
            setIsLoading(false);
            setHasError(true);
        };

        // Check if iframe content is accessible (for X-Frame-Options detection)
        const checkIframeAccess = () => {
            try {
                // Try to access iframe content - if blocked, this will throw
                if (iframe.contentWindow) {
                    // Iframe is accessible (cross-origin is normal)
                    console.log('✅ Iframe contentWindow exists');
                    // Don't set loading to false here, wait for load event
                }
            } catch (e) {
                // Cross-origin or blocked - this is normal for cross-origin iframes
                console.log('ℹ️ Cross-origin iframe (normal):', e.message);
                // Still wait for load event
            }
        };

        // Monitor localStorage for auth token changes (login/logout)
        let lastToken = getMainAppActiveToken();
        let lastLoginId = getMainAppActiveLoginId();

        const checkAuthChanges = () => {
            const currentToken = getMainAppActiveToken();
            const currentLoginId = getMainAppActiveLoginId();

            // If token changed (login or logout), send immediately
            if (currentToken !== lastToken || currentLoginId !== lastLoginId) {
                console.log(`🔄 [${title}] Auth state changed, sending updated token...`);
                lastToken = currentToken;
                lastLoginId = currentLoginId;
                sendAuthData();
            }
        };

        // Check for auth changes every 1 second
        const authCheckInterval = setInterval(checkAuthChanges, 1000);

        // Send auth data periodically (in case token changes)
        const intervalId = setInterval(() => {
            sendAuthData();
        }, 5000); // Every 5 seconds

        // Timeout to detect if iframe never loads
        const loadTimeout = setTimeout(() => {
            if (isLoading) {
                console.warn('⏱️ Iframe load timeout after 10s:', src);
                console.warn('💡 Check if the external site allows iframe embedding');
                setIsLoading(false);
                // Don't set error yet, might still be loading
            }
        }, 10000); // 10 second timeout

        // Listen for iframe load
        iframe.addEventListener('load', handleLoad);
        iframe.addEventListener('error', handleError);

        console.log('🚀 Initializing iframe:', src);

        // Test the URL to check if it's serving HTML or downloads
        fetch(src, { method: 'HEAD', mode: 'no-cors' })
            .then(() => {
                console.log('✅ URL is accessible');
            })
            .catch(err => {
                console.warn('⚠️ Could not test URL (CORS):', err);
            });

        // Check access after a short delay
        setTimeout(checkIframeAccess, 2000);

        // Send initial auth data after a delay
        setTimeout(() => {
            sendAuthData();
        }, 1000);

        // Cleanup
        return () => {
            iframe.removeEventListener('load', handleLoad);
            iframe.removeEventListener('error', handleError);
            window.removeEventListener('message', handleMessage);
            clearInterval(intervalId);
            clearInterval(authCheckInterval);
            clearTimeout(loadTimeout);
        };
    }, [src, isLoading, title]);

    return (
        <div className={`iframe-wrapper ${className}`} style={{ pointerEvents: 'auto', position: 'relative' }}>
            {isLoading && !hasError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-prominent)',
                        fontSize: '1.4rem',
                        zIndex: 100,
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                >
                    Loading {title}...
                </div>
            )}
            {hasError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-prominent)',
                        fontSize: '1.4rem',
                        textAlign: 'center',
                        padding: '2rem',
                        zIndex: 1000,
                        backgroundColor: 'var(--general-main-1)',
                        borderRadius: '0.8rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                >
                    <p style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Failed to load {title}</p>
                    <p
                        style={{
                            fontSize: '1rem',
                            marginTop: '1rem',
                            color: 'var(--text-less-prominent)',
                            marginBottom: '1.5rem',
                        }}
                    >
                        The external site may be blocking iframe embedding or serving downloads instead of HTML.
                        <br />
                        <br />
                        <strong>Possible causes:</strong>
                        <br />
                        • X-Frame-Options header blocking embedding
                        <br />
                        • Content-Type header causing downloads
                        <br />• CORS policy restrictions
                    </p>
                    <a
                        href={src}
                        target='_blank'
                        rel='noopener noreferrer'
                        style={{
                            display: 'inline-block',
                            padding: '0.8rem 1.6rem',
                            backgroundColor: 'var(--button-primary-default)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '0.4rem',
                            fontSize: '1.2rem',
                            marginTop: '1rem',
                        }}
                    >
                        Open in New Tab
                    </a>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={src}
                title={title}
                className='iframe-wrapper__frame'
                frameBorder='0'
                allowFullScreen
                loading='eager'
                allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; display-capture'
                referrerPolicy='no-referrer-when-downgrade'
                {...(sandbox ? { sandbox } : {})}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    minHeight: '100%',
                    opacity: hasError ? 0 : 1,
                    transition: 'opacity 0.3s',
                    border: 'none',
                    background: 'transparent',
                    visibility: hasError ? 'hidden' : 'visible',
                    pointerEvents: hasError ? 'none' : 'auto',
                    zIndex: 10,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                }}
                onLoad={() => {
                    // Additional load handler to catch any issues
                    console.log('📦 Iframe onLoad event fired');
                    setIsLoading(false);
                    // Force set loading to false after a short delay to ensure it's clickable
                    setTimeout(() => {
                        setIsLoading(false);
                        console.log('✅ Iframe should now be fully interactive');
                    }, 100);
                }}
            />
        </div>
    );
});

export default IframeWrapper;
