import { RSPProperties, ServerExplorer } from '../../serverExplorer';
import * as vscode from 'vscode';
import { RSPModel, RSPServer } from 'vscode-server-connector-api';

interface RSPProviderSetting {
    id: string;
    name: string;
    startOnActivation: boolean;
}

export function getAPI(): RSPModel {
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
        await this.updateRSPActivationSettings(rsp, serversExplorer);
        serversExplorer.refresh();
    }

    private async updateRSPActivationSettings(rsp: RSPServer, explorer: ServerExplorer) {
        const settingServer: RSPProviderSetting = {
            id: rsp.type.id,
            name: rsp.type.visibilename,
            startOnActivation: true
        };

        let existingSettings: RSPProviderSetting[] = vscode.workspace.
                                                            getConfiguration('rsp-ui').
                                                            get<[RSPProviderSetting]>(`enableStartServerOnActivation`);
        // unfortunately it seems that the get method (above) works with some cache because
        // if i try to register two or more providers at once for the first time it always return an empty array,
        // it means that the first provider will be overwritten by the second and so on...
        // to prevent this, if an empty array is returned but the RSPServersStatus contains more than one element
        // i'll get the servers already registered from there
        if (!existingSettings || existingSettings.length < 1) {
            if (explorer.RSPServersStatus.size < 2) {
                existingSettings = [settingServer];
            } else {
                existingSettings = Array.from(explorer.RSPServersStatus.values()).
                                        map(server => {
                                            return {
                                                id: server.state.type.id,
                                                name: server.state.type.visibilename,
                                                startOnActivation: true
                                            } as RSPProviderSetting;
                                        });
            }
        } else {
            const rspAlreadyRegistered = existingSettings.find(setting => setting.id === rsp.type.id);
            if (!rspAlreadyRegistered) {
                existingSettings.push(settingServer);
            }
        }
        vscode.workspace.getConfiguration('rsp-ui').update(`enableStartServerOnActivation`, existingSettings, true);
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
