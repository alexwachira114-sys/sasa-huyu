import { isV2Api } from '@deriv/utils';

import {
    TSocketEndpointNames,
    TSocketRequestPayload,
    TSocketResponse,
    TSocketResponseData,
    TSocketSubscribableEndpointNames,
} from '../../types';
import { normalizeV2Response, transformV2Request } from '../iframe-bridge';

const REQ_TIMEOUT = 20000;

// sequence number for requests
let reqSeqNumber = 0;

/**
 * responsible for sending request over given WS and thats it,
 * no handling of reconnections, no state, nothing, just send
 * even request seq number is outside of its scope (reason being, that req_seq needs to be also used by the subscriptions)
 */
function request<T extends TSocketSubscribableEndpointNames>(
    ws: WebSocket,
    name: TSocketEndpointNames,
    payload: TSocketRequestPayload<T>['payload']
): Promise<TSocketResponse<T>> {
    const req_id = ++reqSeqNumber;

    const promise: Promise<TSocketResponseData<T>> = new Promise((resolve, reject) => {
        if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
            reject(new Error('WS is closed or closing'));
            return;
        }

        if (ws.readyState !== ws.OPEN) {
            reject(new Error('WS is not open'));
            return;
        }

        const timeout: NodeJS.Timeout = setTimeout(() => {
            ws.removeEventListener('message', receive);
            reject(new Error(`Request timeout, request: ${name}, payload: ${JSON.stringify(payload)}`));
        }, REQ_TIMEOUT);

        function receive(messageEvent: MessageEvent) {
            const data = JSON.parse(messageEvent.data);
            if (data.req_id !== req_id) {
                return;
            }

            if (data.error) {
                clearTimeout(timeout);
                reject(data);
                return;
            }

            ws.removeEventListener('message', receive);
            clearTimeout(timeout);
            resolve(isV2Api() ? normalizeV2Response(data) : data);
        }

        ws.addEventListener('message', receive);

        const request_payload = {
            [name]: 1,
            ...payload,
            req_id,
        };
        const transformed_payload = isV2Api()
            ? transformV2Request(request_payload as Record<string, unknown>)
            : request_payload;

        if (!transformed_payload) {
            ws.removeEventListener('message', receive);
            clearTimeout(timeout);
            resolve({ msg_type: name } as TSocketResponseData<T>);
            return;
        }

        ws.send(JSON.stringify(transformed_payload));
    });

    return promise;
}

/**
 * responsible for sending request over given WS and thats it,
 * response is not expected, fire and forget,
 * e.g. to unsubscribe - send unsubscribe request away and don't wait for response, e.g. when closing connection
 */
function send<T extends TSocketSubscribableEndpointNames>(
    ws: WebSocket,
    name: TSocketEndpointNames,
    payload: TSocketRequestPayload<T>['payload']
): void {
    const req_id = ++reqSeqNumber;

    if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
        console.error('WS is closed or closing'); // eslint-disable-line no-console
        return;
    }

    if (ws.readyState !== ws.OPEN) {
        console.error('WS is not open'); // eslint-disable-line no-console
        return;
    }

    const request_payload = {
        [name]: 1,
        ...payload,
        req_id,
    };
    const transformed_payload = isV2Api()
        ? transformV2Request(request_payload as Record<string, unknown>)
        : request_payload;

    if (!transformed_payload) return;

    ws.send(JSON.stringify(transformed_payload));
}

/**
 * reset request sequence number
 * used in tests
 * havent found better way to reset it within tests themselves
 * without exposting extra function
 */
export function resetReqSeqNumber() {
    reqSeqNumber = 0;
}

export default request;
export { send };
