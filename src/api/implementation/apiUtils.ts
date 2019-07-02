import { API, RSPProviderAPI } from 'vscode-server-connector-api';

export function available(api: RSPProviderAPI): API<RSPProviderAPI> {
    return { available: true, api: api };
}
