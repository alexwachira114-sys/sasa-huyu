import React from 'react';
import { observer } from 'mobx-react-lite';
import Flyout from '@/components/flyout';
import { useStore } from '@/hooks/useStore';
import { load, runIrreversibleEvents } from '@/external/bot-skeleton/scratch/utils';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { NOTIFICATION_TYPE } from '@/components/bot-notification/bot-notification-utils';
import ApiHelpers from '@/external/bot-skeleton/services/api/api-helpers';
import StopBotModal from '../dashboard/stop-bot-modal';
import Toolbar from './toolbar';
import Toolbox from './toolbox';
import './workspace.scss';

// After loading a bot's XML into a fresh workspace, the Market/Trade Type/Contract Type
// dropdowns in the "Trade parameters" block can render blank if active_symbols data
// wasn't fully loaded at the exact moment the trade_definition_market block was created
// (e.g. bots loaded immediately on navigation from the Free Bots library). Re-firing a
// BlockCreate event once active symbols are confirmed loaded re-triggers the same
// dropdown population chain (market -> submarket -> symbol -> trade type -> contract type)
// used elsewhere in the app on reconnect/account switch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const repopulateTradeParameterDropdowns = async (workspace: any) => {
    const active_symbols = ApiHelpers?.instance?.active_symbols;
    if (!active_symbols) return;

    try {
        await active_symbols.retrieveActiveSymbols();
    } catch {
        return;
    }

    workspace
        .getAllBlocks()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((block: any) => block.type === 'trade_definition_market')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .forEach((block: any) => {
            runIrreversibleEvents(() => {
                const fake_create_event = new window.Blockly.Events.BlockCreate(block);
                window.Blockly.Events.fire(fake_create_event);
            });
        });
};

const WorkspaceWrapper = observer(() => {
    const { blockly_store, dashboard } = useStore();
    const { onMount, onUnmount, is_loading } = blockly_store;
    const { pending_free_bot, clearPendingFreeBot, setOpenSettings } = dashboard;

    // Track if we've already processed a pending bot to prevent duplicates
    const processedBotRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        onMount();
        return () => {
            onUnmount();
            // Reset processed bot ref on unmount
            processedBotRef.current = null;
        };
    }, []);

    // Reset processed bot ref when there's no pending bot
    React.useEffect(() => {
        if (!pending_free_bot) {
            processedBotRef.current = null;
        }
    }, [pending_free_bot]);

    // When workspace becomes available and a Free Bots handoff exists, load it once
    React.useEffect(() => {
        const maybeLoadPending = async () => {
            // Only proceed if we have a workspace, pending bot, and haven't processed this bot yet
            if (
                window.Blockly?.derivWorkspace &&
                pending_free_bot?.xml &&
                !is_loading &&
                processedBotRef.current !== pending_free_bot.name
            ) {
                // Mark this bot as being processed to prevent duplicates
                processedBotRef.current = pending_free_bot.name;

                try {
                    await load({
                        block_string: pending_free_bot.xml,
                        file_name: pending_free_bot.name,
                        workspace: window.Blockly.derivWorkspace,
                        from: save_types.LOCAL,
                        drop_event: {},
                        strategy_id: null,
                        showIncompatibleStrategyDialog: false,
                    });
                    // Show import notification and clear handoff
                    setOpenSettings?.(NOTIFICATION_TYPE.BOT_IMPORT);
                    clearPendingFreeBot();

                    // Ensure Market/Trade Type/Contract Type dropdowns render populated,
                    // even if active symbols weren't fully loaded when the blocks were created.
                    await repopulateTradeParameterDropdowns(window.Blockly.derivWorkspace);

                    // Reset the processed bot ref after successful load
                    processedBotRef.current = null;
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to load pending free bot:', e);
                    // Reset on error so user can retry
                    processedBotRef.current = null;
                }
            }
        };
        maybeLoadPending();
    }, [pending_free_bot?.name, pending_free_bot?.xml, is_loading]);

    if (is_loading) return null;

    if (window.Blockly?.derivWorkspace)
        return (
            <React.Fragment>
                <Toolbox />
                <Toolbar />
                <Flyout />
                <StopBotModal />
            </React.Fragment>
        );

    return null;
});

export default WorkspaceWrapper;
