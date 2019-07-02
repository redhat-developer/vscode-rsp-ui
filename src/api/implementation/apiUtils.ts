import { API, RSPModel } from 'vscode-server-connector-api';

export function available(api: RSPModel): API<RSPModel> {
    return { available: true, api: api };
}
