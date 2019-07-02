import { available } from '../implementation/apiUtils';
import { RSPProperties, ServerExplorer } from '../../serverExplorer';
import * as vscode from 'vscode';
import { API, RSPModel, RSPServer } from 'vscode-server-connector-api';

export function api(): API<RSPModel> {
    return available(impl());
}

export function impl(): RSPModel {
    return new RSPProviderAPIImpl();
}

class RSPProviderAPIImpl implements RSPModel {
    constructor() {}

    public async registerRSPProvider(rsp: RSPServer): Promise<void> {
        let error: string;
        if (!rsp) {
            error = 'Unable to register RSP provider - RSP state is not valid.';
            vscode.window.showErrorMessage(error);
            return Promise.reject(error);
        }

        if (!rsp.type || !rsp.type.id) {
            error = 'Unable to register RSP provider - Id is not valid.';
            vscode.window.showErrorMessage(error);
            return Promise.reject(error);
        }

        const rspserverstdout = vscode.window.createOutputChannel(`${rsp.type.visibilename} (stdout)`);
        const rspserverstderr = vscode.window.createOutputChannel(`${rsp.type.visibilename} (stderr)`);
        const rspProperties: RSPProperties = {
            state: { ...rsp, serverStates: undefined },
            client: undefined,
            rspserverstderr: rspserverstderr,
            rspserverstdout: rspserverstdout
        };
        const serversExplorer = ServerExplorer.getInstance();
        serversExplorer.RSPServersStatus.set(rsp.type.id, rspProperties);
        serversExplorer.refresh();
    }

    public async deregisterRSPProvider(id: string): Promise<void> {
        if (!id) {
            const error = 'Unable to remove RSP provider - Id is not valid.';
            vscode.window.showErrorMessage(error);
            return Promise.reject(error);
        }

        const serversExplorer = ServerExplorer.getInstance();
        if (!serversExplorer.RSPServersStatus.has(id)) {
            const error = 'No RSP Provider was found with this id.';
            return Promise.reject(error);
        }

        serversExplorer.disposeRSPProperties(id);
        serversExplorer.RSPServersStatus.delete(id);
        serversExplorer.refresh();
    }
}
