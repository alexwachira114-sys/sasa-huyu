import { getAppId } from '@/components/shared';

declare global {
    interface Window {
        _newSystemWS?: WebSocket;
        _newSystemHandlers?: Set<(msg: unknown) => void>;
    }
}

export type TradeMsg = Record<string, unknown>;
export type MsgHandler = (msg: TradeMsg) => void;

function isNewAuthActive(): boolean {
    return !!(window._newSystemWS && window._newSystemWS.readyState === WebSocket.OPEN);
}

function convertToNewFormat(data: TradeMsg): TradeMsg {
    const out = { ...data };
    if (out.proposal === 1 && out.symbol) {
        out.underlying_symbol = out.symbol;
        delete out.symbol;
    }
    if ('buy' in out) {
        out.buy = String(out.buy);
    }
    return out;
}

export class TradeWSManager {
    private reqId = 1;
    private pending = new Map<number, { resolve: (v: TradeMsg) => void; reject: (e: Error) => void }>();
    private subHandlers = new Map<string, MsgHandler>();
    private globalHandlers = new Set<MsgHandler>();
    private ws: WebSocket | null = null;
    private newWSListener: ((e: MessageEvent) => void) | null = null;
    private _isNewAuth = false;

    constructor() {
        this._isNewAuth = isNewAuthActive();
    }

    get isNewAuth() {
        return this._isNewAuth;
    }

    async connect(token: string | null): Promise<void> {
        if (this._isNewAuth) {
            const newWS = window._newSystemWS!;
            this.newWSListener = (e: MessageEvent) => {
                try {
                    this.dispatch(JSON.parse(e.data) as TradeMsg);
                } catch {}
            };
            newWS.addEventListener('message', this.newWSListener);
        } else {
            const appId = getAppId() || 111670;
            const server = localStorage.getItem('config.server_name') || 'ws.derivws.com';
            const url = `wss://${server}/websockets/v3?app_id=${appId}&l=EN&brand=deriv`;
            await new Promise<void>((resolve, reject) => {
                this.ws = new WebSocket(url);
                this.ws.onmessage = (e) => {
                    try {
                        this.dispatch(JSON.parse(e.data) as TradeMsg);
                    } catch {}
                };
                this.ws.onerror = () => reject(new Error('WS connection failed'));
                this.ws.onopen = async () => {
                    if (token) {
                        try {
                            await this.request({ authorize: token });
                        } catch (err) {
                            console.warn('[TradeWS] Auth error:', err);
                        }
                    }
                    resolve();
                };
            });
        }
    }

    private dispatch(msg: TradeMsg) {
        const reqId = msg.req_id as number | undefined;
        const subId = (msg.subscription as { id?: string } | undefined)?.id;

        if (reqId && this.pending.has(reqId)) {
            const { resolve } = this.pending.get(reqId)!;
            this.pending.delete(reqId);
            resolve(msg);
        }

        if (subId && this.subHandlers.has(subId)) {
            this.subHandlers.get(subId)!(msg);
        }

        this.globalHandlers.forEach(h => h(msg));
    }

    private rawSend(data: TradeMsg) {
        if (this._isNewAuth && window._newSystemWS?.readyState === WebSocket.OPEN) {
            window._newSystemWS.send(JSON.stringify(convertToNewFormat(data)));
        } else if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    request(data: TradeMsg): Promise<TradeMsg> {
        const req_id = this.reqId++;
        const msg = { ...data, req_id };
        return new Promise((resolve, reject) => {
            this.pending.set(req_id, { resolve, reject });
            this.rawSend(msg);
            setTimeout(() => {
                if (this.pending.has(req_id)) {
                    this.pending.delete(req_id);
                    reject(new Error('Request timeout'));
                }
            }, 15000);
        });
    }

    subscribe(data: TradeMsg, handler: MsgHandler): () => void {
        const req_id = this.reqId++;
        let capturedSubId: string | null = null;

        const capture: MsgHandler = (msg) => {
            if ((msg.req_id as number) !== req_id) return;
            const subId = (msg.subscription as { id?: string } | undefined)?.id;
            if (subId) {
                capturedSubId = subId;
                this.subHandlers.set(subId, handler);
                this.globalHandlers.delete(capture);
            }
            handler(msg);
        };

        this.globalHandlers.add(capture);
        this.rawSend({ ...data, subscribe: 1, req_id });

        return () => {
            this.globalHandlers.delete(capture);
            if (capturedSubId) {
                this.subHandlers.delete(capturedSubId);
                this.rawSend({ forget: capturedSubId });
            }
        };
    }

    forgetAll(type: string) {
        this.rawSend({ forget_all: type });
    }

    destroy() {
        if (this.newWSListener && window._newSystemWS) {
            window._newSystemWS.removeEventListener('message', this.newWSListener);
        }
        this.ws?.close();
        this.globalHandlers.clear();
        this.subHandlers.clear();
        this.pending.clear();
    }
}
