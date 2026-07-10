import { isV2Api } from '@deriv/utils';

import {
    TSocketError,
    TSocketRequestPayload,
    TSocketResponse,
    TSocketResponseData,
    TSocketSubscribableEndpointNames,
} from '../../types';
import { normalizeV2Response } from '../iframe-bridge';

import request, { send } from './request';

/**
 * Subscribes directly to backend stream
 * Backend does not support duplicate subscription on different subscriptionId though,
 * so thats why we have subscriptions manager - to group multiple FE subscription in one backend subscriptions
 */
export default class Subscription {
    authorizedWs: WebSocket;
    name: TSocketSubscribableEndpointNames;
    payload: TSocketRequestPayload<TSocketSubscribableEndpointNames>['payload'];

    reqId: number | null;
    subscriptionId: string | null;

    lastData: TSocketResponse<TSocketSubscribableEndpointNames> | null;

    boundOnWsMessage: (messageEvent: MessageEvent) => void;
    boundOnWsClose: () => void;

    listeners: Array<(data: TSocketResponse<TSocketSubscribableEndpointNames>) => void>;

    setAuthorizedWs(authorizedWs?: WebSocket) {
        if (!authorizedWs) {
            return;
        }

        this.authorizedWs = authorizedWs;

        this.authorizedWs.removeEventListener('message', this.boundOnWsMessage);
        this.authorizedWs.removeEventListener('close', this.boundOnWsClose);

        this.subscribe();
    }

    constructor(
        authorizedWs: WebSocket,
        name: TSocketSubscribableEndpointNames,
        payload: TSocketRequestPayload<TSocketSubscribableEndpointNames>['payload']
    ) {
        this.authorizedWs = authorizedWs;
        this.name = name;
        this.payload = payload;

        this.reqId = null;
        this.subscriptionId = null;

        this.lastData = null;

        this.boundOnWsMessage = this.onWsMessage.bind(this);
        this.boundOnWsClose = this.onWsClose.bind(this);

        this.listeners = [];
    }

    async unsubscribe() {
        this.authorizedWs.removeEventListener('message', this.boundOnWsMessage);
        this.authorizedWs.removeEventListener('close', this.boundOnWsClose);
        send(this.authorizedWs, 'forget', { forget: this.subscriptionId });
    }

    onWsClose() {
        this.authorizedWs.removeEventListener('message', this.boundOnWsMessage);
        this.authorizedWs.removeEventListener('close', this.boundOnWsClose);
    }

    async subscribe() {
        this.authorizedWs.addEventListener('message', this.boundOnWsMessage);
        this.authorizedWs.addEventListener('close', this.boundOnWsClose);

        const data: TSocketResponseData<TSocketSubscribableEndpointNames> = await request(
            this.authorizedWs,
            this.name,
            {
                subscribe: 1,
                ...this.payload,
            }
        );

        // @ts-expect-error due to incorrect type defintion, to be fixed later
        this.reqId = data.req_id;
        // @ts-expect-error due to incorrect type definition, to be fixed later
        this.subscriptionId = data.subscription.id;
        this.lastData = data;

        this.listeners.forEach(listener => listener(data));
    }

    addListener(onData: (data: TSocketResponse<TSocketSubscribableEndpointNames>) => void) {
        this.listeners.push(onData);
    }

    removeListener(onData: (data: TSocketResponse<TSocketSubscribableEndpointNames>) => void) {
        this.listeners = this.listeners.filter(listener => listener !== onData);
    }

    onWsMessage<T extends TSocketSubscribableEndpointNames>(messageEvent: MessageEvent) {
        const raw_data = JSON.parse(messageEvent.data) as TSocketResponse<T> & TSocketError<T>;
        const data = isV2Api() ? normalizeV2Response(raw_data) : raw_data;

        if (data.req_id !== this.reqId) {
            return;
        }

        this.lastData = data;
        this.listeners.forEach(listener => listener(data));
    }
}
