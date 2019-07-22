/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';

import { initClient } from './rsp/client';
import { DebugInfo } from './debug/debugInfo';
import { DebugInfoProvider } from './debug/debugInfoProvider';
import { JavaDebugSession } from './debug/javaDebugSession';
import { Protocol, RSPClient, ServerState, StatusSeverity } from 'rsp-client';
//import { ServerEditorAdapter } from './serverEditorAdapter';
import { DeployableStateNode, RSPProperties, RSPState, ServerExplorer, ServerStateNode } from './serverExplorer';
import { Utils } from './utils/utils';
import * as vscode from 'vscode';
import { RSPController, ServerInfo } from 'vscode-server-connector-api';
import { WorkflowStrategyManager } from './workflow/workflowStrategyManager';
import { WorkflowStrategy } from './workflow/workflowStrategy';

export class CommandHandler {

    private static readonly LIST_RUNTIMES_TIMEOUT: number = 20000;

    private debugSession: JavaDebugSession;
    public serverPropertiesChannel: Map<string, vscode.OutputChannel> = new Map<string, vscode.OutputChannel>();

    constructor(private explorer: ServerExplorer) {
        this.debugSession = new JavaDebugSession();
    }

    public async startRSP(context?: RSPState): Promise<void> {
        if (context === undefined) {
            const filterRSPPredicate = serverR => serverR.state.state === ServerState.STOPPED || serverR.state.state === ServerState.UNKNOWN;
            const rsp = await this.selectRSP('Select RSP provider you want to start', filterRSPPredicate);
            if (!rsp || !rsp.id) return;
            context = this.explorer.RSPServersStatus.get(rsp.id).state;
        }

        if (!(context.state === ServerState.STOPPED
            || context.state === ServerState.UNKNOWN)) {
            return Promise.reject(`The RSP server ${context.type.visibilename} is already running.`);
        }

        const rspProvider: RSPController = await Utils.activateExternalProvider(context.type.id);
        this.setRSPListener(context.type.id, rspProvider);
        const serverInfo: ServerInfo = await rspProvider.startRSP(
            (out: string) => this.onStdoutData(context.type.id, out),
            (err: string) => this.onStderrData(context.type.id, err)
        );

        if (!serverInfo || !serverInfo.port) {
            return Promise.reject(`Failed to start the ${context.type.visibilename} RSP server`);
        }

        const client = await initClient(serverInfo);

        const rspProperties: RSPProperties = this.explorer.RSPServersStatus.get(context.type.id);
        rspProperties.client = client;
        rspProperties.state.serverStates = [];
        this.explorer.RSPServersStatus.set(context.type.id, rspProperties);
        await this.activate(context.type.id, client);
        this.explorer.initRSPNode(context.type.id);
    }

    public async stopRSP(forced: boolean, context?: RSPState): Promise<void> {
        if (context === undefined) {
            let filterRSPPredicate;
            if (!forced) {
                filterRSPPredicate = serverR => serverR.state.state === ServerState.STARTED;
            } else {
                filterRSPPredicate = serverR => serverR.state.state === ServerState.STARTED ||
                                             serverR.state.state === ServerState.STARTING ||
                                             serverR.state.state === ServerState.STOPPING;
            }
            const rsp = await this.selectRSP('Select RSP provider you want to start', filterRSPPredicate);
            if (!rsp || !rsp.id) return null;
            context = this.explorer.RSPServersStatus.get(rsp.id).state;
        }

        if (context.state === ServerState.STARTED
            || context.state === ServerState.STARTING
            || context.state === ServerState.STOPPING) {
            this.explorer.updateRSPServer(context.type.id, ServerState.STOPPING);

            if (!forced) {
                const client: RSPClient = this.explorer.getClientByRSP(context.type.id);
                if (!client) {
                    return Promise.reject(`Failed to contact the RSP server ${context.type.visibilename}.`);
                }
                client.shutdownServer();
            } else {
                const rspProvider: RSPController = await Utils.activateExternalProvider(context.type.id);
                await rspProvider.stopRSP().catch(err => {
                    // if stopRSP fails, server is still running
                    this.explorer.updateRSPServer(context.type.id, ServerState.STARTED);
                    return Promise.reject(`Failed to terminate ${context.type.visibilename} - ${err}`);
                });
            }

            this.explorer.updateRSPServer(context.type.id, ServerState.STOPPED);
            this.explorer.disposeRSPProperties(context.type.id);
            this.explorer.refresh();
        } else {
            return Promise.reject(`The RSP server ${context.type.visibilename} is already stopped.`);
        }
    }

    public async startServer(mode: string, context?: ServerStateNode): Promise<Protocol.StartServerResponse> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.state === ServerState.STOPPED || server.state === ServerState.UNKNOWN;
            const serverId = await this.selectServer(rsp.id, 'Select server to start.', serverFilter);
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        const serverState = this.explorer.getServerStateById(context.rsp, context.server.id).state;
        if (!(serverState === ServerState.STOPPED
            || serverState === ServerState.UNKNOWN)) {
            return Promise.reject('The server is already running.');
        }

        const client: RSPClient = this.explorer.getClientByRSP(context.rsp);
        if (!client) {
            return Promise.reject('Failed to contact the RSP server.');
        }

        const response = await client.getOutgoingHandler().startServerAsync({
            params: {
                serverType: context.server.type.id,
                id: context.server.id,
                attributes: new Map<string, any>()
            },
            mode: mode
        });
        if (!StatusSeverity.isOk(response.status)) {
            return Promise.reject(response.status.message);
        }
        return response;
    }

    public async stopServer(forced: boolean, context?: ServerStateNode): Promise<Protocol.Status> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.state === ServerState.STARTED;
            const serverId = await this.selectServer(rsp.id, 'Select server to stop.', serverFilter);
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        const serverState = this.explorer.getServerStateById(context.rsp, context.server.id).state;
        if ((!forced && serverState === ServerState.STARTED)
            || (forced && (serverState === ServerState.STARTING
                            || serverState === ServerState.STOPPING))) {
            const client: RSPClient = this.explorer.getClientByRSP(context.rsp);
            if (!client) {
                return Promise.reject('Failed to contact the RSP server.');
            }
            const status = await client.getOutgoingHandler().stopServerAsync({ id: context.server.id, force: true });
            if (this.debugSession.isDebuggerStarted()) {
                await this.debugSession.stop();
            }
            if (!StatusSeverity.isOk(status)) {
                return Promise.reject(status.message);
            }
            return status;
        } else {
            return Promise.reject('The server is already stopped.');
        }
    }

    public async debugServer(context?: ServerStateNode): Promise<Protocol.StartServerResponse> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.state === ServerState.STOPPED || server.state === ServerState.UNKNOWN;
            const serverId = await this.selectServer(rsp.id, 'Select server to start.', serverFilter);
            if (!serverId) return;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        const client: RSPClient = this.explorer.getClientByRSP(context.rsp);
        if (!client) {
            return Promise.reject('Failed to contact the RSP server.');
        }
        const debugInfo: DebugInfo = await DebugInfoProvider.retrieve(context.server, client);
        const extensionIsRequired = await this.checkExtension(debugInfo);
        if (extensionIsRequired) {
            return Promise.reject(extensionIsRequired);
        }

        this.startServer('debug', context)
            .then(serverStarted => {
                if (!serverStarted
                    || !serverStarted.details) {
                    return Promise.reject(`Failed to start server ${context.server.id}`);
                }
                const port: string = DebugInfoProvider.create(serverStarted.details).getPort();
                this.debugSession.start(context.server, port, client);
                return Promise.resolve(serverStarted);
            });
    }

    public async removeServer(context?: ServerStateNode): Promise<Protocol.Status> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.state === ServerState.STOPPED || server.state === ServerState.UNKNOWN;
            const serverId = await this.selectServer(rsp.id, 'Select server to remove', serverFilter);
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        const remove = await vscode.window.showWarningMessage(
            `Remove server ${context.server.id}?`, { modal: true }, 'Yes');
        return remove && this.removeStoppedServer(context.rsp, context.server);
    }

    private async removeStoppedServer(rspId: string, server: Protocol.ServerHandle): Promise<Protocol.Status> {
        const status1: ServerStateNode = this.explorer.getServerStateById(rspId, server.id);
        if (status1.state !== ServerState.STOPPED) {
            return Promise.reject(`Stop server ${server.id} before removing it.`);
        }
        const client: RSPClient = this.explorer.getClientByRSP(rspId);
        if (!client) {
            return Promise.reject('Failed to contact the RSP server.');
        }
        const status = await client.getOutgoingHandler().deleteServer({ id: server.id, type: server.type });
        if (!StatusSeverity.isOk(status)) {
            return Promise.reject(status.message);
        }
        return status;
    }

    public async showServerOutput(context?: ServerStateNode): Promise<void> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverId = await this.selectServer(rsp.id, 'Select server to show output channel');
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }
        this.explorer.showOutput(context);
    }

    public async restartServer(mode: string, context?: ServerStateNode): Promise<Protocol.StartServerResponse> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.state === ServerState.STARTED;
            const serverId: string = await this.selectServer(rsp.id, 'Select server to restart', serverFilter);
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        return this.stopServer(false, context)
            .then(() => {
                if (mode === 'debug') {
                    return this.debugServer(context);
                } else if (mode === 'run') {
                    return this.startServer('run', context);
                } else {
                    return Promise.reject(`Could not restart server: unknown mode ${mode}`);
                }
            });
    }

    public async addDeployment(context?: ServerStateNode): Promise<Protocol.Status> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverId = await this.selectServer(rsp.id, 'Select server to deploy to');
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        if (this.explorer) {
            return this.explorer.addDeployment(context);
        } else {
            return Promise.reject('Runtime Server Protocol (RSP) Server is starting, please try again later.');
        }
    }

    public async removeDeployment(context?: DeployableStateNode): Promise<Protocol.Status> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.publishState === ServerState.PUBLISH_STATE_NONE ||
                                           server.publishState === ServerState.PUBLISH_STATE_INCREMENTAL ||
                                           server.publishState === ServerState.PUBLISH_STATE_UNKNOWN;
            const serverId = await this.selectServer(rsp.id, 'Select server to remove deployment from', serverFilter);
            if (!serverId) return null;
            const deployables = this.explorer.getServerStateById(rsp.id, serverId).deployableStates.map(value => {
                return {
                    label: value.reference.label,
                    deployable: value
                };
            });
            const deployment = await vscode.window.showQuickPick(deployables, { placeHolder: 'Select deployment to remove' });
            if (!deployment || !deployment.deployable) return null;
            context = deployment.deployable;
        }

        return this.explorer.removeDeployment(context.rsp, context.server, context.reference);
    }

    public async publishServer(publishType: number, context?: ServerStateNode): Promise<Protocol.Status> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverId = await this.selectServer(rsp.id, 'Select server to publish');
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        return this.explorer.publish(context.rsp, context.server, publishType); // TODO use constant? Where is it?
    }

    public async createServer(context?: RSPState): Promise<Protocol.Status> {
        this.assertExplorerExists();
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to use to create a server');
            if (!rsp || !rsp.id) return;
            context = this.explorer.RSPServersStatus.get(rsp.id).state;
        }

        const download: string = await vscode.window.showQuickPick(['Yes', 'No, use server on disk'],
            { placeHolder: 'Download server?', ignoreFocusOut: true });
        if (!download) {
            return;
        }
        if (download.startsWith('Yes')) {
            return this.downloadRuntime(context.type.id);
        } else if (download.startsWith('No')) {
            return this.addLocation(context.type.id);
        }
    }

    private assertExplorerExists() {
        if (!this.explorer) {
            throw new Error('Runtime Server Protocol (RSP) Server is starting, please try again later.');
        }
    }

    public async addLocation(rspId: string): Promise<Protocol.Status> {
        if (this.explorer) {
            if (!rspId) {
                const rsp = await this.selectRSP('Select RSP provider you want to use');
                if (!rsp || !rsp.id) return;
                rspId = rsp.id;
            }
            return this.explorer.addLocation(rspId);
        } else {
            return Promise.reject('Runtime Server Protocol (RSP) Server is starting, please try again later.');
        }
    }

    public async downloadRuntime(rspId: string): Promise<Protocol.Status> {
        if (!rspId) {
            const rsp = await this.selectRSP('Select RSP provider you want to use');
            if (!rsp || !rsp.id) return;
            rspId = rsp.id;
        }

        const client = this.explorer.getClientByRSP(rspId);
        if (!client) {
            return Promise.reject('Failed to contact the RSP server.');
        }

        const rtId: string = await this.promptDownloadableRuntimes(client);
        if (!rtId) {
            return;
        }
        let response: Protocol.WorkflowResponse = await this.initEmptyDownloadRuntimeRequest(rtId, client);
        while (true) {
            const workflowMap = {};
            const status = await this.handleWorkflow(response, workflowMap);
            if (!status) {
                return;
            } else if (!StatusSeverity.isInfo(status)) {
                return status;
            }
            // Now we have a data map
            response = await this.initDownloadRuntimeRequest(rtId, workflowMap, response.requestId, client);
        }
    }

    public async serverActions(context?: ServerStateNode): Promise<Protocol.Status> {
        this.assertExplorerExists();
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverId = await this.selectServer(rsp.id, 'Select server you want to retrieve info about');
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        const client: RSPClient = this.explorer.getClientByRSP(context.rsp);
        if (!client) {
            return Promise.reject(`Failed to contact the RSP server ${context.rsp}.`);
        }

        const action: string = await this.chooseServerActions(context.server, client);
        if (!action) {
            return;
        }
        return await this.executeServerAction(action, context, client);
    }

    private async chooseServerActions(server: Protocol.ServerHandle, client: RSPClient): Promise<string> {
        const actionsList = await client.getOutgoingHandler().listServerActions(server)
            .then((response: Protocol.ListServerActionResponse) => {
                return response.workflows.map(action => {
                    return {
                        label: action.actionLabel,
                        id: action.actionId
                    };
                });
            });

        if (actionsList.length === 0) {
            vscode.window.showInformationMessage('there are no additional actions for this server');
            return;
        }

        const answer = await vscode.window.showQuickPick(actionsList,
            { placeHolder: 'Please choose the action you want to execute.' });
        if (!answer) {
            return;
        } else {
            return answer.id;
        }
    }

    private async executeServerAction(action: string, context: ServerStateNode, client: RSPClient): Promise<Protocol.Status> {
        const actionRequest: Protocol.ServerActionRequest = {
            actionId: action,
            data: {
                'ShowInBrowserActionHandler.selection.id': context.deployableStates[0].reference.label
            },
            requestId: null,
            serverId: context.server.id
        };

        let response: Protocol.WorkflowResponse = await client.getOutgoingHandler().executeServerAction(actionRequest);
        while (true) {
            const workflowMap = {};
            const status = await this.handleWorkflow(response, workflowMap);
            if (!status) {
                return;
            } else if (!StatusSeverity.isInfo(status)) {
                return status;
            }

            actionRequest.requestId = response.requestId;
            actionRequest.data = workflowMap;
            // Now we have a data map
            response = await client.getOutgoingHandler().executeServerAction(actionRequest);
        }
    }

    private async handleWorkflow(response: Protocol.WorkflowResponse, workflowMap?: { [index: string]: any } ): Promise<Protocol.Status> {
        // if (StatusSeverity.isOk(response.status)) {
        //     return Promise.resolve(response.status);
        // } else
        if (StatusSeverity.isError(response.status)
                    || StatusSeverity.isCancel(response.status)) {
            // error
            return Promise.reject(response.status);
        }

        // not complete, not an error.
        if (!workflowMap) {
            workflowMap = {};
        }
        if (response.items) {
            for (const item of response.items) {
                const strategy: WorkflowStrategy = new WorkflowStrategyManager().getStrategy(item.itemType);
                const canceled: boolean = await strategy.handler(item, workflowMap);
                if (canceled) {
                    return;
                }
            }
        }

        return Promise.resolve(response.status);
    }

    public async editServer(context?: ServerStateNode): Promise<void> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverId = await this.selectServer(rsp.id, 'Select server you want to retrieve info about');
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }

        if (this.explorer) {
            return this.explorer.editServer(context.rsp, context.server);
        } else {
            return Promise.reject('Runtime Server Protocol (RSP) Server is starting, please try again later.');
        }
    }

    public async infoServer(context?: ServerStateNode): Promise<void> {
        if (context === undefined) {
            if (this.explorer) {
                const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
                if (!rsp || !rsp.id) return null;
                const serverId = await this.selectServer(rsp.id, 'Select server you want to retrieve info about');
                if (!serverId) return null;
                context = this.explorer.getServerStateById(rsp.id, serverId);
            } else {
                return Promise.reject('Runtime Server Protocol (RSP) Server is starting, please try again later.');
            }
        }

        const selectedServerType: Protocol.ServerType = context.server.type;
        const selectedServerName: string = context.server.id;

        let outputChannel: vscode.OutputChannel;
        if (this.serverPropertiesChannel.has(selectedServerName)) {
            outputChannel = this.serverPropertiesChannel.get(selectedServerName);
            outputChannel.clear();
        } else {
            outputChannel = vscode.window.createOutputChannel(`Properties: ${selectedServerName}`);
            this.serverPropertiesChannel.set(selectedServerName, outputChannel);
        }

        outputChannel.show();
        outputChannel.appendLine(`Server Name: ${selectedServerName}`);
        outputChannel.appendLine(`Server Type Id: ${selectedServerType.id}`);
        outputChannel.appendLine(`Server Description: ${selectedServerType.visibleName}`);
    }

    private async selectRSP(message: string, predicateFilter?: (value: RSPProperties) => unknown): Promise<{ label: string; id: string; }> {
        const rspProviders = Array.from(this.explorer.RSPServersStatus.values()).
                                filter(predicateFilter ? predicateFilter : value => value.state.state === ServerState.STARTED).
                                map(rsp => {
                                    return {
                                        label: (!rsp.state.type.visibilename ?
                                                rsp.state.type.id :
                                                rsp.state.type.visibilename),
                                        id: rsp.state.type.id
                                    };
                                });

        if (rspProviders.length < 1) {
            return Promise.reject('There are no RSP providers to choose from.');
        }
        if (rspProviders.length === 1) {
            return rspProviders[0];
        }
        return await vscode.window.showQuickPick(rspProviders, { placeHolder: message });
    }

    private async selectServer(rspId: string, message: string, stateFilter?: (value: ServerStateNode) => unknown): Promise<string> {
        let servers: ServerStateNode[] = this.explorer.getServerStatesByRSP(rspId);

        if (stateFilter) {
            servers = servers.filter(stateFilter);
        }
        if (!servers || servers.length < 1) {
            return Promise.reject('There are no servers to choose from.');
        }

        return vscode.window.showQuickPick(servers.map(server => server.server.id), { placeHolder: message });
    }

    // private async promptUser(item: Protocol.WorkflowResponseItem, workflowMap: {}): Promise<boolean> {
    //     const prompt = item.label + (item.content ? `\n${item.content}` : '');
    //     let userInput: any = null;
    //     if (item.prompt == null || item.prompt.responseType === 'none') {
    //         userInput = await vscode.window.showQuickPick(['Continue...'],
    //             { placeHolder: prompt, ignoreFocusOut: true });
    //     } else {
    //         if (item.prompt.responseType === 'bool') {
    //             const oneProp = await vscode.window.showQuickPick(['True', 'False'],
    //                 { placeHolder: prompt, ignoreFocusOut: true });
    //             userInput = (oneProp === 'True');
    //         } else {
    //             const oneProp = await vscode.window.showInputBox(
    //                 { prompt: prompt, ignoreFocusOut: true, password: item.prompt.responseSecret });
    //             if (item.prompt.responseType === 'int') {
    //                 userInput = +oneProp;
    //             } else {
    //                 userInput = oneProp;
    //             }
    //         }
    //     }

    //     workflowMap[item.id] = userInput;
    //     return userInput === undefined;
    // }

    // private isMultilineText(content: string) {
    //     return content && content.indexOf('\n') !== -1;
    // }

    private async initDownloadRuntimeRequest(id: string, data1: {[index: string]: any}, reqId: number, client: RSPClient):
        Promise<Protocol.WorkflowResponse> {
        const req: Protocol.DownloadSingleRuntimeRequest = {
            requestId: reqId,
            downloadRuntimeId: id,
            data: data1
        };

        const resp: Promise<Protocol.WorkflowResponse> = client.getOutgoingHandler().downloadRuntime(req, 20000);
        return resp;
    }

    private async initEmptyDownloadRuntimeRequest(id: string, client: RSPClient): Promise<Protocol.WorkflowResponse> {
        const req: Protocol.DownloadSingleRuntimeRequest = {
            requestId: null,
            downloadRuntimeId: id,
            data: {}
        };
        const resp: Promise<Protocol.WorkflowResponse> = client.getOutgoingHandler().downloadRuntime(req);
        return resp;
    }

    private async promptDownloadableRuntimes(client: RSPClient): Promise<string> {
        const newlist = client.getOutgoingHandler().listDownloadableRuntimes(CommandHandler.LIST_RUNTIMES_TIMEOUT)
            .then(async (list: Protocol.ListDownloadRuntimeResponse) => {
                const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
                const rts: Protocol.DownloadRuntimeDescription[] = list.runtimes.sort((runtimeA, runtimeB) => collator.compare(runtimeA.name, runtimeB.name));
                const newlist: any[] = [];
                for (const rt of rts) {
                    newlist.push({ label: rt.name, id: rt.id });
                }
                return newlist;
            });
        const answer = await vscode.window.showQuickPick(newlist,
            { placeHolder: 'Please choose a server to download.' });
        console.log(`${answer} was chosen`);
        if (!answer) {
            return null;
        } else {
            return answer.id;
        }
    }

    private async checkExtension(debugInfo: DebugInfo): Promise<string> {
        if (!debugInfo) {
            return `Could not find server debug info.`;
        }

        if (!debugInfo.isJavaType()) {
            return `vscode-rsp-ui doesn\'t support debugging with ${debugInfo.getType()} language at this time.`;
        }

        if (this.hasJavaDebugExtension()) {
            return 'Debugger for Java extension is required. Install/Enable it before proceeding.';
        }
    }

    private hasJavaDebugExtension(): boolean {
        return vscode.extensions.getExtension('vscjava.vscode-java-debug') === undefined;
    }

    private onStdoutData(rspId: string, data: string) {
        const rspserverstdout = this.explorer.getRSPOutputChannel(rspId);
        this.displayLog(rspserverstdout, data.toString());
    }

    private onStderrData(rspId: string, data: string) {
        const rspserverstderr = this.explorer.getRSPErrorChannel(rspId);
        this.displayLog(rspserverstderr, data.toString());
    }

    private displayLog(outputPanel: vscode.OutputChannel, message: string, show: boolean = true) {
        if (outputPanel) {
            if (show) outputPanel.show();
            outputPanel.appendLine(message);
        }
    }

    public async setRSPListener(rspId: string, rspProvider: RSPController): Promise<void> {
        rspProvider.onRSPServerStateChanged(state => {
            this.explorer.updateRSPServer(rspId, state);
        });
    }

    public async activate(rspId: string, client: RSPClient): Promise<void> {
        client.getIncomingHandler().onServerAdded(handle => {
            this.explorer.insertServer(rspId, handle);
        });

        client.getIncomingHandler().onServerRemoved(handle => {
            this.explorer.removeServer(rspId, handle);
        });

        client.getIncomingHandler().onServerStateChanged(event => {
            this.explorer.updateServer(rspId, event);
        });

        client.getIncomingHandler().onServerProcessOutputAppended(event => {
            this.explorer.addServerOutput(event);
        });
    }
}
