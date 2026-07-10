import {
    BRIDGE_MESSAGE_TYPES,
    type IframeToParentMsg,
    isAuthErrorMsg,
    isAuthMsg,
    type NewdtraderAuthMsg,
} from './bridge-types';

type TBridgeClientOptions = {
    iframeVersion: string;
};

export class BridgeClient {
    private readonly iframeVersion: string;
    private listener?: (event: MessageEvent) => void;
    private authResolver?: (auth: NewdtraderAuthMsg) => void;
    private authRejecter?: (error: Error) => void;
    private authMatcher?: (auth: NewdtraderAuthMsg) => boolean;
    private timeoutHandle?: ReturnType<typeof setTimeout>;
    private pendingAuth?: NewdtraderAuthMsg;
    private pendingError?: Error;
    private stopped = false;

    constructor(options: TBridgeClientOptions) {
        this.iframeVersion = options.iframeVersion;
    }

    start() {
        this.stopped = false;
        this.listener = event => this.handleMessage(event);
        window.addEventListener('message', this.listener);
        this.post({ type: BRIDGE_MESSAGE_TYPES.READY, iframeVersion: this.iframeVersion });
    }

    stop() {
        this.stopped = true;

        if (this.listener) {
            window.removeEventListener('message', this.listener);
            this.listener = undefined;
        }

        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = undefined;
        }

        if (this.authRejecter) {
            this.authRejecter(new Error('Bridge stopped'));
            this.cleanupResolvers();
        }
    }

    waitForAuth(timeoutMs: number, authMatcher?: (auth: NewdtraderAuthMsg) => boolean) {
        return new Promise<NewdtraderAuthMsg>((resolve, reject) => {
            if (this.stopped) {
                reject(new Error('Bridge stopped before waitForAuth'));
                return;
            }

            if (this.pendingAuth) {
                const auth = this.pendingAuth;
                this.pendingAuth = undefined;
                if (!authMatcher || authMatcher(auth)) {
                    resolve(auth);
                    return;
                }
            }

            if (this.pendingError) {
                const error = this.pendingError;
                this.pendingError = undefined;
                reject(error);
                return;
            }

            this.authResolver = resolve;
            this.authRejecter = reject;
            this.authMatcher = authMatcher;
            this.timeoutHandle = setTimeout(() => {
                if (this.authRejecter) {
                    this.authRejecter(new Error('Bridge auth timeout'));
                    this.cleanupResolvers();
                }
            }, timeoutMs);
        });
    }

    requestAuth() {
        this.pendingAuth = undefined;
        this.pendingError = undefined;
        this.post({ type: BRIDGE_MESSAGE_TYPES.REQUEST_AUTH });
    }

    notifyReconnectFailed() {
        this.post({ type: BRIDGE_MESSAGE_TYPES.RECONNECT_FAILED });
    }

    notifyNeedRelogin() {
        this.post({ type: BRIDGE_MESSAGE_TYPES.NEED_RELOGIN });
    }

    private post(message: IframeToParentMsg) {
        window.parent.postMessage(message, '*');
    }

    private handleMessage(event: MessageEvent) {
        if (this.stopped) return;

        if (event.source !== window.parent) {
            return;
        }

        if (isAuthErrorMsg(event.data)) {
            const error = new Error(`Auth error from parent: ${event.data.error}`);
            if (this.authRejecter) {
                this.authRejecter(error);
                this.cleanupResolvers();
            } else {
                this.pendingError = error;
            }
            return;
        }

        if (isAuthMsg(event.data)) {
            if (this.authResolver) {
                if (this.authMatcher && !this.authMatcher(event.data)) return;
                this.authResolver(event.data);
                this.cleanupResolvers();
            } else {
                this.pendingAuth = event.data;
            }
        }
    }

    private cleanupResolvers() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = undefined;
        }

        this.authResolver = undefined;
        this.authRejecter = undefined;
        this.authMatcher = undefined;
    }
}
