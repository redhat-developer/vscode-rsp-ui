import { api } from './rspProviderAPI';
import { API, APIBroker, RSPModel } from 'vscode-server-connector-api';

export function apiBroker(): APIBroker {
    return {
        get(): API<RSPModel> {
            return api();
        }
    };
}