import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { TradeWSManager, TradeMsg } from './trade-ws';

export type ActiveSymbol = {
    symbol: string;
    display_name: string;
    market: string;
    market_display_name: string;
    submarket: string;
    submarket_display_name: string;
    exchange_is_open: 0 | 1;
    pip: number;
    decimal_places: number;
};

export type ProposalInfo = {
    id: string;
    ask_price: number;
    payout: number;
    spot: number;
    spot_time: number;
    longcode: string;
    error?: string;
    error_code?: string;
    has_error: boolean;
};

export type OpenPosition = {
    contract_id: number;
    contract_type: string;
    display_name: string;
    shortcode: string;
    underlying_symbol: string;
    entry_spot: number;
    current_spot: number;
    purchase_time: number;
    date_expiry?: number;
    expiry_time?: number;
    buy_price: number;
    bid_price: number;
    profit_loss: number;
    is_sold: boolean;
    is_expired: boolean;
    status: 'open' | 'won' | 'lost' | 'sold';
    duration_type?: string;
    payout?: number;
};

export type PurchaseResult = {
    contract_id: number;
    contract_type: string;
    longcode: string;
    buy_price: number;
    payout: number;
    transaction_id: number;
    error?: string;
};

export const TRADE_TYPE_TABS = [
    { id: 'RISE_FALL', label: 'Rise/Fall', contracts: ['CALL', 'PUT'] },
    { id: 'DIGITS', label: 'Digits', subtypes: [
        { id: 'OVER_UNDER', label: 'Over/Under', contracts: ['DIGITOVER', 'DIGITUNDER'] },
        { id: 'EVEN_ODD', label: 'Even/Odd', contracts: ['DIGITEVEN', 'DIGITODD'] },
        { id: 'MATCH_DIFFER', label: 'Match/Differ', contracts: ['DIGITMATCH', 'DIGITDIFF'] },
    ]},
    { id: 'TOUCH', label: 'Touch/No Touch', contracts: ['ONETOUCH', 'NOTOUCH'] },
];

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
    CALL: 'Rise',
    PUT: 'Fall',
    DIGITOVER: 'Over',
    DIGITUNDER: 'Under',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    DIGITMATCH: 'Matches',
    DIGITDIFF: 'Differs',
    ONETOUCH: 'Touch',
    NOTOUCH: 'No Touch',
};

export const DURATION_UNITS = [
    { value: 't', label: 'Ticks' },
    { value: 's', label: 'Seconds' },
    { value: 'm', label: 'Minutes' },
    { value: 'h', label: 'Hours' },
    { value: 'd', label: 'Days' },
];

const isDigitContract = (ct: string) => ct.startsWith('DIGIT');
const isTouchContract = (ct: string) => ct === 'ONETOUCH' || ct === 'NOTOUCH';

export class TradeExecutionStore {
    ws: TradeWSManager | null = null;

    symbol = 'R_100';
    tradeTypeTab = 'RISE_FALL';
    digitSubtype = 'OVER_UNDER';
    duration = 5;
    durationUnit = 't';
    stake = '10';
    currency = 'USD';
    lastDigit = 5;

    activeSymbols: ActiveSymbol[] = [];
    proposalInfo: Record<string, ProposalInfo> = {};
    openPositions: OpenPosition[] = [];
    spotPrice = '';
    spotTime = 0;

    isLoadingSymbols = false;
    isPurchasing = false;
    purchaseResult: PurchaseResult | null = null;
    error: string | null = null;
    isConnected = false;

    private proposalUnsubs: Array<() => void> = [];
    private positionUnsub: (() => void) | null = null;
    private spotUnsub: (() => void) | null = null;
    private _token: string | null = null;

    constructor() {
        makeObservable(this, {
            symbol: observable,
            tradeTypeTab: observable,
            digitSubtype: observable,
            duration: observable,
            durationUnit: observable,
            stake: observable,
            currency: observable,
            lastDigit: observable,
            activeSymbols: observable,
            proposalInfo: observable,
            openPositions: observable,
            spotPrice: observable,
            spotTime: observable,
            isLoadingSymbols: observable,
            isPurchasing: observable,
            purchaseResult: observable,
            error: observable,
            isConnected: observable,
            currentContracts: computed,
            groupedSymbols: computed,
            selectedSymbolInfo: computed,
            setSymbol: action,
            setTradeTypeTab: action,
            setDigitSubtype: action,
            setDuration: action,
            setDurationUnit: action,
            setStake: action,
            setLastDigit: action,
            purchase: action,
        });
    }

    get currentContracts(): string[] {
        const tab = TRADE_TYPE_TABS.find(t => t.id === this.tradeTypeTab);
        if (!tab) return ['CALL', 'PUT'];
        if (tab.subtypes) {
            const sub = tab.subtypes.find(s => s.id === this.digitSubtype);
            return sub?.contracts || tab.subtypes[0].contracts;
        }
        return tab.contracts || ['CALL', 'PUT'];
    }

    get groupedSymbols(): Record<string, ActiveSymbol[]> {
        return this.activeSymbols.reduce((acc, sym) => {
            const key = sym.market_display_name || sym.market || 'Other';
            if (!acc[key]) acc[key] = [];
            acc[key].push(sym);
            return acc;
        }, {} as Record<string, ActiveSymbol[]>);
    }

    get selectedSymbolInfo(): ActiveSymbol | undefined {
        return this.activeSymbols.find(s => s.symbol === this.symbol);
    }

    async init(token: string | null, currency: string) {
        this._token = token;
        runInAction(() => { this.currency = currency || 'USD'; });

        try {
            const ws = new TradeWSManager();
            await ws.connect(token);
            runInAction(() => {
                this.ws = ws;
                this.isConnected = true;
            });
            await this.fetchActiveSymbols();
            this.subscribeSpot();
            this.subscribeProposals();
            this.subscribeOpenPositions();
        } catch (err) {
            runInAction(() => {
                this.error = 'Connection failed. Please refresh.';
                this.isConnected = false;
            });
        }
    }

    async fetchActiveSymbols() {
        if (!this.ws) return;
        runInAction(() => { this.isLoadingSymbols = true; });
        try {
            const res = await this.ws.request({
                active_symbols: 'brief',
                product_type: 'basic',
            });
            const symbols = (res.active_symbols as ActiveSymbol[] | undefined) || [];
            runInAction(() => {
                this.activeSymbols = symbols.filter(s => s.exchange_is_open);
                this.isLoadingSymbols = false;
                if (this.activeSymbols.length && !this.activeSymbols.find(s => s.symbol === this.symbol)) {
                    this.symbol = this.activeSymbols[0].symbol;
                }
            });
        } catch {
            runInAction(() => { this.isLoadingSymbols = false; });
        }
    }

    setSymbol = (sym: string) => {
        this.symbol = sym;
        this.proposalInfo = {};
        this.spotPrice = '';
        this.clearProposalSubs();
        this.clearSpotSub();
        this.subscribeSpot();
        this.subscribeProposals();
    };

    setTradeTypeTab = (tab: string) => {
        this.tradeTypeTab = tab;
        this.proposalInfo = {};
        this.clearProposalSubs();
        this.adjustDurationForTab(tab);
        this.subscribeProposals();
    };

    setDigitSubtype = (sub: string) => {
        this.digitSubtype = sub;
        this.proposalInfo = {};
        this.clearProposalSubs();
        this.subscribeProposals();
    };

    private adjustDurationForTab(tab: string) {
        if (tab === 'RISE_FALL' || tab === 'DIGITS') {
            if (this.durationUnit !== 't') {
                this.durationUnit = 't';
                this.duration = 5;
            }
        } else if (tab === 'TOUCH') {
            if (this.durationUnit === 't') {
                this.durationUnit = 'm';
                this.duration = 15;
            }
        }
    }

    setDuration = (val: number) => {
        this.duration = val;
        this.clearProposalSubs();
        this.subscribeProposals();
    };

    setDurationUnit = (unit: string) => {
        this.durationUnit = unit;
        const defaults: Record<string, number> = { t: 5, s: 60, m: 15, h: 1, d: 1 };
        this.duration = defaults[unit] || 5;
        this.clearProposalSubs();
        this.subscribeProposals();
    };

    setStake = (val: string) => {
        this.stake = val;
        this.clearProposalSubs();
        this.subscribeProposals();
    };

    setLastDigit = (digit: number) => {
        this.lastDigit = digit;
        this.clearProposalSubs();
        this.subscribeProposals();
    };

    private buildProposalRequest(contractType: string) {
        const base: Record<string, unknown> = {
            proposal: 1,
            amount: parseFloat(this.stake) || 10,
            basis: 'stake',
            contract_type: contractType,
            currency: this.currency,
            symbol: this.symbol,
        };

        if (isDigitContract(contractType)) {
            base.duration = this.duration;
            base.duration_unit = 't';
            if (contractType === 'DIGITOVER' || contractType === 'DIGITUNDER' ||
                contractType === 'DIGITMATCH' || contractType === 'DIGITDIFF') {
                base.barrier = this.lastDigit;
            }
        } else if (isTouchContract(contractType)) {
            base.duration = this.duration;
            base.duration_unit = this.durationUnit === 't' ? 'm' : this.durationUnit;
        } else {
            base.duration = this.duration;
            base.duration_unit = this.durationUnit;
        }

        return base;
    }

    private subscribeProposals() {
        if (!this.ws || !this.isConnected) return;
        const contracts = this.currentContracts;
        contracts.forEach(contractType => {
            const req = this.buildProposalRequest(contractType);
            const unsub = this.ws!.subscribe(req, (msg: TradeMsg) => {
                const proposal = msg.proposal as Record<string, unknown> | undefined;
                const err = msg.error as Record<string, unknown> | undefined;
                runInAction(() => {
                    if (proposal) {
                        this.proposalInfo = {
                            ...this.proposalInfo,
                            [contractType]: {
                                id: proposal.id as string,
                                ask_price: Number(proposal.ask_price),
                                payout: Number(proposal.payout),
                                spot: Number(proposal.spot),
                                spot_time: Number(proposal.spot_time),
                                longcode: proposal.longcode as string,
                                has_error: false,
                            },
                        };
                    } else if (err) {
                        this.proposalInfo = {
                            ...this.proposalInfo,
                            [contractType]: {
                                id: '',
                                ask_price: 0,
                                payout: 0,
                                spot: 0,
                                spot_time: 0,
                                longcode: err.message as string,
                                error: err.message as string,
                                error_code: err.code as string,
                                has_error: true,
                            },
                        };
                    }
                });
            });
            this.proposalUnsubs.push(unsub);
        });
    }

    private clearProposalSubs() {
        this.proposalUnsubs.forEach(u => u());
        this.proposalUnsubs = [];
    }

    private subscribeSpot() {
        if (!this.ws) return;
        this.spotUnsub = this.ws.subscribe(
            { ticks: this.symbol },
            (msg: TradeMsg) => {
                const tick = msg.tick as Record<string, unknown> | undefined;
                if (tick) {
                    runInAction(() => {
                        this.spotPrice = String(tick.quote ?? tick.bid ?? '');
                        this.spotTime = Number(tick.epoch);
                    });
                }
            }
        );
    }

    private clearSpotSub() {
        this.spotUnsub?.();
        this.spotUnsub = null;
    }

    private subscribeOpenPositions() {
        if (!this.ws) return;
        this.positionUnsub = this.ws.subscribe(
            { proposal_open_contract: 1 },
            (msg: TradeMsg) => {
                const poc = msg.proposal_open_contract as Record<string, unknown> | undefined;
                if (!poc || !poc.contract_id) return;
                runInAction(() => {
                    const id = Number(poc.contract_id);
                    const existing = this.openPositions.findIndex(p => p.contract_id === id);
                    const profit = Number(poc.profit) || 0;

                    const pos: OpenPosition = {
                        contract_id: id,
                        contract_type: String(poc.contract_type || ''),
                        display_name: String(poc.display_name || poc.underlying || ''),
                        shortcode: String(poc.shortcode || ''),
                        underlying_symbol: String(poc.underlying || ''),
                        entry_spot: Number(poc.entry_spot || poc.entry_tick || 0),
                        current_spot: Number(poc.current_spot || 0),
                        purchase_time: Number(poc.purchase_time || poc.date_start || 0),
                        date_expiry: poc.date_expiry ? Number(poc.date_expiry) : undefined,
                        buy_price: Number(poc.buy_price || 0),
                        bid_price: Number(poc.bid_price || poc.current_spot || 0),
                        profit_loss: profit,
                        is_sold: !!poc.is_sold,
                        is_expired: !!poc.is_expired,
                        status: poc.is_sold ? (profit >= 0 ? 'won' : 'lost') : 'open',
                        payout: Number(poc.payout || 0),
                    };

                    if (existing >= 0) {
                        const updated = [...this.openPositions];
                        updated[existing] = pos;
                        this.openPositions = updated;
                    } else {
                        this.openPositions = [pos, ...this.openPositions];
                    }

                    if (poc.is_sold) {
                        setTimeout(() => {
                            runInAction(() => {
                                this.openPositions = this.openPositions.filter(p => p.contract_id !== id);
                            });
                        }, 5000);
                    }
                });
            }
        );
    }

    purchase = async (contractType: string) => {
        if (!this.ws || this.isPurchasing) return;
        const info = this.proposalInfo[contractType];
        if (!info || info.has_error || !info.id) {
            runInAction(() => { this.error = 'No valid proposal. Please wait.'; });
            return;
        }

        runInAction(() => {
            this.isPurchasing = true;
            this.purchaseResult = null;
            this.error = null;
        });

        try {
            const res = await this.ws!.request({
                buy: info.id,
                price: info.ask_price,
            });
            const bought = res.buy as Record<string, unknown> | undefined;
            const err = res.error as Record<string, unknown> | undefined;

            runInAction(() => {
                this.isPurchasing = false;
                if (bought) {
                    this.purchaseResult = {
                        contract_id: Number(bought.contract_id),
                        contract_type: contractType,
                        longcode: String(bought.longcode || ''),
                        buy_price: Number(bought.buy_price),
                        payout: Number(bought.payout),
                        transaction_id: Number(bought.transaction_id),
                    };
                    this.proposalInfo = {};
                    this.clearProposalSubs();
                    this.subscribeProposals();
                } else if (err) {
                    this.error = String(err.message || 'Purchase failed');
                    this.clearProposalSubs();
                    this.subscribeProposals();
                }
            });
        } catch (e: unknown) {
            runInAction(() => {
                this.isPurchasing = false;
                this.error = e instanceof Error ? e.message : 'Purchase failed';
            });
        }
    };

    destroy() {
        this.clearProposalSubs();
        this.clearSpotSub();
        this.positionUnsub?.();
        this.ws?.destroy();
    }
}
