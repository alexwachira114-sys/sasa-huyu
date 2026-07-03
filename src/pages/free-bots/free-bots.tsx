import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { getBotsManifest, prefetchAllXmlInBackground, fetchXmlWithCache } from '@/utils/freebots-cache';
import './free-bots.scss';

interface BotData {
    name: string;
    description: string;
    difficulty: string;
    strategy: string;
    features: string[];
    xml: string;
    badge_text?: string;
    badge_class?: string;
}

const DEFAULT_FEATURES = ['Automated Trading', 'Risk Management', 'Profit Optimization'];

const FreeBots = observer(() => {
    const { dashboard, app } = useStore();
    const { active_tab, setActiveTab, setPendingFreeBot } = dashboard;
    const [availableBots, setAvailableBots] = useState<BotData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bot descriptions mapping
    const getBotDescription = (botName: string): string => {
        const descriptions: { [key: string]: string } = {
            'STARTER BOT':
                'Official starter bot for Freezy Trading Hub. Optimized for beginners with standard risk management.',
            'POVERTY KILLER':
                'High-performance digit trading bot with intelligent recovery and profit optimization.',
            'POVERTY KILLER V2.1':
                'Updated version of the Poverty Killer bot with enhanced performance and risk management.',
            'BEST RISE FALL':
                'Automated rise and fall strategy optimized for consistent returns in trending markets.',
            'CAXYNEXUS-AI AUTOMATED RISE FALL':
                'Premium Freezy Trading Hub rise and fall strategy featuring advanced entry points and recovery mechanisms.',
            'OVER1 R32 PRO':
                'Professional Over 1 trading bot with R32 recovery strategy. Optimized for high win rates with intelligent recovery mechanisms and risk management.',
            'OVER2 R43 PRO':
                'Advanced Over 2 bot featuring R43 recovery system. Designed for consistent profits with sophisticated entry points and recovery strategies.',
            'THE CMV PRO':
                'Premium CMV Pro trading bot with multi-strategy approach. Combines technical analysis with automated execution for maximum profitability.',
            'UNDER BLAST PRO':
                'High-performance Under trading bot with blast strategy. Optimized for rapid execution and high-probability trades in Under markets.',
            'UNDER7 R56 PRO':
                'Professional Under 7 bot with R56 recovery mechanism. Features intelligent risk management and recovery strategies for consistent returns.',
            'UNDER8 R67 PRO':
                'Advanced Under 8 trading bot with R67 recovery system. Designed for optimal performance with sophisticated pattern recognition and recovery.',
            'CAXYNEXUS-AIV3RISE FALL':
                'Premium Rise/Fall trading bot with MACD analysis and intelligent recovery. Optimized for consistent returns in trending markets.',
            'CAXYNEXUS-AI RISE/FALL V4':
                'Latest version of the Freezy Trading Hub Rise/Fall bot. Enhanced with improved entry signals and advanced recovery management for maximum stability.',
            'OVER UNDER SWITCHER BOT':
                'Dual Over/Under strategy on Volatility 10 Index. Automatically switches between Over 5 and Under 4 predictions with a 2× Martingale recovery and $200 take-profit target.',
            'DERIV WIZARD 1':
                'RSI + Moving Average signal bot on Volatility 10 (1s) Index. Trades Rise/Fall using indicator confluence with a 0.3× Martingale level and $100 expected profit target.',
            'EXPERT WAGER V4 EVEN ODD':
                'Pattern-analysis Even/Odd bot on Volatility 10 (1s) Index. Scans the last-digit history to detect streaks, then trades with a 2× Martingale and $50 take-profit cap.',
            'FIREFOX 1.0':
                'Adaptive Digit Under bot on Volatility 10 (1s) Index. Uses Under 8 before a loss and tightens to Under 6 after, with a 2.55× Martingale split and 39% payout calibration.',
            'MR DUKE SPEED BOT':
                'Speed-optimised Digit Over bot on Volatility 100 Index. Entrypoint set at digit 1, with intelligent stake recovery and a $20 take-profit / $1 000 stop-loss safety net.',
            'OVER DESTROYER V1':
                'Aggressive Over/Under bot on Volatility 25 (1s) Index. Opens Over 1 on first trade, switches to Under 7 on loss, with a 2.25× Martingale and up to 7 recovery levels.',
            'RISE FALL KIND':
                'Balanced Rise/Fall bot on Volatility 25 (1s) Index. Trades both contract directions with optional 2× Martingale, $10 take-profit, and $50 stop-loss guard.',
            'UNDER DESTROYER V11':
                'Precision Under/Over bot on Volatility 90 (1s) Index. Starts Under 8 and flips to Over 4 on consecutive losses, with a 2.2× Martingale across up to 7 recovery levels.',
            'AUTO GREENFLAKES E O':
                'Adaptive Even/Odd multiplier bot on Volatility 75 Index. Confirms entry with a digit trigger, tracks streaks over a timed window, and applies a 2× Martingale recovery toward a target profit.',
                        };

        // Try exact match first
        if (descriptions[botName]) {
            return descriptions[botName];
        }

        // Try partial matches
        for (const key in descriptions) {
            if (botName.includes(key) || key.includes(botName)) {
                return descriptions[key];
            }
        }

        return `Advanced trading bot: ${botName}. Features automated trading, risk management, and profit optimization.`;
    };

    // Show selected bots from public/xml (explicit curated list)
    const getXmlFiles = () => {
        return [
            'STARTER_BOT.xml',
            'POVERTY_KILLER.xml',
            'POVERTY_KILLER_V2.1.xml',
            'BEST_RISE_FALL.xml',
            'CAXYNEXUS_AI_AUTOMATED_RISE_FALL.xml',
            'THE CMV PRO.xml',
            'UNDER BLAST PRO.xml',
            'OVER1_R32 PRO.xml',
            'OVER2_R43 PRO.xml',
            'UNDER8_R67 PRO.xml',
            'UNDER7_R56 PRO.xml',
            'CAXYNEXUS_AIV3RISE_FALL.xml',
            'CAXYNEXUS_AIRISE_FALLV4.xml',
            'OVER_UNDER_SWITCHER_BOT.xml',
            'DERIV_WIZARD_1.xml',
            'EXPERT_WAGER_V4_EVEN_ODD.xml',
            'FIREFOX_1.0.xml',
            'MR_DUKE_SPEED_BOT.xml',
            'OVER_DESTROYER_V1.xml',
            'RISE_FALL_KIND.xml',
            'UNDER_DESTROYER_V11.xml',
            'AUTO_GREENFLAKES_E_O.xml',
        ];
    };

    // Wait for workspace to be available
    const waitForWorkspace = (maxAttempts = 3, delay = 50) => {
        return new Promise((resolve, reject) => {
            let attempts = 0;

            const checkWorkspace = () => {
                attempts++;
                if (window.Blockly?.derivWorkspace) {
                    console.log('Workspace is ready!');
                    resolve(window.Blockly.derivWorkspace);
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Workspace not available after maximum attempts'));
                } else {
                    console.log(`Waiting for workspace... attempt ${attempts}/${maxAttempts}`);
                    setTimeout(checkWorkspace, delay);
                }
            };

            checkWorkspace();
        });
    };

    // Load bot into builder
    const loadBotIntoBuilder = (bot: BotData) => {
        if (bot.xml) {
            // Flag the selected bot for the Bot Builder to load after navigation
            setPendingFreeBot({ name: bot.name, xml: bot.xml });
            // Instant navigation
            setActiveTab(DBOT_TABS.BOT_BUILDER);
        }
    };

    // Load bots with instant UI and progressive loading (no blocking spinner)
    useEffect(() => {
        const loadBots = async () => {
            // Always load when component is mounted (now used as sub-component)

            setError(null);

            // 0) Immediately render skeleton cards from a small fallback list
            const fallback = getXmlFiles().map(file => ({ name: file.replace('.xml', ''), file }));
            const initialSkeleton: BotData[] = fallback.map(item => {
                const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                return {
                    name: botName,
                    description: getBotDescription(botName),
                    difficulty: 'Intermediate',
                    strategy: 'Multi-Strategy',
                    features: DEFAULT_FEATURES,
                    xml: '',
                };
            });
            setAvailableBots(initialSkeleton);
            setIsLoading(false); // hide "Loading free bots..." right away

            try {
                // Force use of explicit list only; ignore remote manifest
                const manifest = getXmlFiles().map(file => ({ name: file.replace('.xml', ''), file }));

                // Update skeletons to our explicit list
                const skeletonBots: BotData[] = manifest.map(item => {
                    const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ').replace('CAXYNEXUS-AIRISE FALLV4', 'CAXYNEXUS-AI RISE/FALL V4');
                    const isPremiumPlus = botName.includes('CAXYNEXUS-AI RISE/FALL V4');
                    return {
                        name: botName,
                        description: getBotDescription(botName),
                        difficulty: 'Intermediate',
                        strategy: 'Multi-Strategy',
                        features: DEFAULT_FEATURES,
                        xml: '',
                        badge_text: isPremiumPlus ? 'PREMIUM PLUS' : 'PREMIUM',
                        badge_class: isPremiumPlus ? 'premium-plus' : 'premium',
                    };
                });
                setAvailableBots(skeletonBots);

                // 3) Load XMLs progressively in background
                const loadedBots: BotData[] = [];
                for (let i = 0; i < manifest.length; i++) {
                    const item = manifest[i];
                    try {
                        const xml = await fetchXmlWithCache(item.file);
                        if (xml) {
                            const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ').replace('CAXYNEXUS-AIRISE FALLV4', 'CAXYNEXUS-AI RISE/FALL V4');
                            const isPremiumPlus = botName.includes('CAXYNEXUS-AI RISE/FALL V4');
                            loadedBots.push({
                                name: botName,
                                description: getBotDescription(botName),
                                difficulty: 'Intermediate',
                                strategy: 'Multi-Strategy',
                                features: DEFAULT_FEATURES,
                                xml,
                                badge_text: isPremiumPlus ? 'PREMIUM PLUS' : 'PREMIUM',
                                badge_class: isPremiumPlus ? 'premium-plus' : 'premium',
                            });
                            setAvailableBots([...loadedBots, ...skeletonBots.slice(loadedBots.length)]);
                        }
                    } catch (err) {
                        console.warn(`Failed to load ${item.file}:`, err);
                    }
                }
            } catch (error) {
                console.error('Error loading bots:', error);
                setError('Failed to load bots. Please try again.');
            }
        };

        loadBots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className='free-bots'>
            <div className='free-bots__container'>
                {isLoading ? (
                    <div className='free-bots__loading'>
                        <Text size='s' color='general'>
                            {localize('Loading free bots...')}
                        </Text>
                    </div>
                ) : error ? (
                    <div className='free-bots__error'>
                        <Text size='s' color='general'>
                            {error}
                        </Text>
                        <div style={{ marginTop: '20px' }}>
                            <Button onClick={() => window.location.reload()}>{localize('Retry')}</Button>
                        </div>
                    </div>
                ) : availableBots.length === 0 ? (
                    <div className='free-bots__empty'>
                        <Text size='s' color='general'>
                            {localize('No bots available at the moment.')}
                        </Text>
                    </div>
                ) : (
                    <div className='free-bots__grid'>
                        {availableBots.map((bot, index) => (
                                <div
                                    key={index}
                                    className={`free-bot-card ${bot.badge_class ? `free-bot-card--${bot.badge_class}` : ''}`}
                                    data-badge={bot.badge_text || 'PREMIUM'}
                                >
                                <div className='free-bot-card__header'>
                                    <Text size='s' weight='bold' className='free-bot-card__title'>
                                        {bot.name}
                                    </Text>

                                    {/* Star Rating */}
                                    <div className='free-bot-card__rating'>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                    </div>

                                    {/* Bot Description */}
                                    <Text size='xs' className='free-bot-card__description'>
                                        {bot.description}
                                    </Text>
                                </div>

                                <Button
                                    className='free-bot-card__load-btn'
                                    onClick={() => loadBotIntoBuilder(bot)}
                                    primary
                                    has_effect
                                    type='button'
                                    disabled={!bot.xml} // Disable if XML not loaded yet
                                >
                                    {bot.xml ? 'LOAD PREMIUM BOT' : 'LOADING...'}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default FreeBots;
