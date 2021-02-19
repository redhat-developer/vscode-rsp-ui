import { executeCommandAndLog } from '../../extension';
import { CommandHandler } from '../../extensionApi';
import { RSPProperties, RSPState, ServerExplorer } from '../../serverExplorer';
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
        const rspState: RSPState = { ...rsp, serverStates: undefined };
        const rspProperties: RSPProperties = {
            state: rspState,
            client: undefined,
            rspserverstderr: rspserverstderr,
            rspserverstdout: rspserverstdout,
            info: undefined
        };
        const serversExplorer = ServerExplorer.getInstance();
        serversExplorer.RSPServersStatus.set(rsp.type.id, rspProperties);
        serversExplorer.refresh();
        const startRSP = await this.updateRSPActivationSetting(rsp, serversExplorer);
        if (startRSP ) {
            if( vscode.window.state.focused) {
                const commandHandler = new CommandHandler(serversExplorer);
                executeCommandAndLog('server.startRSP', commandHandler.startRSP, commandHandler, rspState, 'Unable to start the RSP server: ');
            } else {
                setTimeout(function() {
                    const commandHandler = new CommandHandler(serversExplorer);
                    executeCommandAndLog('server.startRSP', commandHandler.startRSP, commandHandler, rspState, 'Unable to start the RSP server: ');
                    }, 3000);
            }
        }
    }

    private async updateRSPActivationSetting(rsp: RSPServer, explorer: ServerExplorer): Promise<boolean> {
        let startRSP = true;
        let existingSettings: RSPProviderSetting[] = vscode.workspace.
                                                            getConfiguration('rsp-ui').
                                                            get<[RSPProviderSetting]>(`enableStartServerOnActivation`);
        // unfortunately it seems that the get method (above) works with some cache because
        // if i try to register two or more providers at once for the first time it always return an empty array,
        // it means that the first provider will be overwritten by the second and so on...
        // to prevent this, if an empty array is returned i'll get the servers already registered from RSPServersStatus
        if (!existingSettings || existingSettings.length < 1) {
            existingSettings = Array.from(explorer.RSPServersStatus.values()).
                                    map(server => {
                                        return {
                                            id: server.state.type.id,
                                            name: server.state.type.visibilename,
                                            startOnActivation: true
                                        } as RSPProviderSetting;
                                    });
        } else {
            const rspAlreadyRegistered = existingSettings.find(setting => setting.id === rsp.type.id);
            if (!rspAlreadyRegistered) {
                const settingServer: RSPProviderSetting = {
                    id: rsp.type.id,
                    name: rsp.type.visibilename,
                    startOnActivation: true
                };
                existingSettings.push(settingServer);
            } else {
                startRSP = rspAlreadyRegistered.startOnActivation;
            }
        }
        await vscode.workspace.getConfiguration('rsp-ui').update(`enableStartServerOnActivation`, existingSettings, true);
        return startRSP;
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
