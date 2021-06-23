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
import { DeployableStateNode, RSPProperties, RSPState, ServerExplorer, ServerStateNode } from './serverExplorer';
import { Utils } from './utils/utils';
import * as vscode from 'vscode';
import { RSPController, ServerInfo } from 'vscode-server-connector-api';
import { WorkflowResponseStrategy, WorkflowResponseStrategyManager } from './workflow/response/workflowResponseStrategyManager';
import { sendTelemetry } from './telemetry';

export interface ServerActionItem {
    label: string;
    id: string;
    actionWorkflow: Protocol.WorkflowResponse;
}

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

        let telemetryProps: any = {
            type: context.type.id,
        };
        sendTelemetry('server.startRSP', telemetryProps);

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
        client.onConnectionClosed(event => {
            this.explorer.disposeRSPProperties(context.type.id);
            this.explorer.updateRSPServer(context.type.id, ServerState.STOPPED);
        });
    

        const rspProperties: RSPProperties = this.explorer.RSPServersStatus.get(context.type.id);
        rspProperties.client = client;
        rspProperties.state.serverStates = [];
        rspProperties.info = serverInfo;
        
        this.explorer.RSPServersStatus.set(context.type.id, rspProperties);
        await this.activate(context.type.id, client);
        this.explorer.initRSPNode(context.type.id);
    }

    public async disconnectRSP(context?: RSPState): Promise<void> {
        if( context === undefined )
            return Promise.reject(`No RSP selected`);
        const id = context.type.id;
        let telemetryProps: any = {
            type: id,
        };
        sendTelemetry('server.disconnectRSP', telemetryProps);

        //const contextProperties = this.explorer.RSPServersStatus.get(id);
        const client: RSPClient = this.explorer.getClientByRSP(id);
        client.disconnect();
        this.explorer.disposeRSPProperties(context.type.id);
        this.explorer.updateRSPServer(context.type.id, ServerState.STOPPED);
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
            const rsp = await this.selectRSP('Select RSP provider you want to stop', filterRSPPredicate);
            if (!rsp || !rsp.id) return null;
            context = this.explorer.RSPServersStatus.get(rsp.id).state;
        }

        let telemetryProps: any = {
            type: context.type.id,
            force: forced,
        };
        sendTelemetry('server.stopRSP', telemetryProps);

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

            this.explorer.disposeRSPProperties(context.type.id);
            this.explorer.updateRSPServer(context.type.id, ServerState.STOPPED);
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
        let telemetryProps: any = {
            type: context.server.type.id,
            debug: false,
        };
        sendTelemetry('server.start', telemetryProps);

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

        let telemetryProps: any = {
            type: context.server.type.id,
            forced: forced,
        };
        sendTelemetry('server.stop', telemetryProps);

        const serverState = this.explorer.getServerStateById(context.rsp, context.server.id).state;
        if ((!forced && serverState === ServerState.STARTED)
            || (forced && (serverState === ServerState.STARTING
                            || serverState === ServerState.STOPPING))) {
            const client: RSPClient = this.explorer.getClientByRSP(context.rsp);
            if (!client) {
                return Promise.reject('Failed to contact the RSP server.');
            }
            const status = await client.getOutgoingHandler().stopServerAsync(
                { id: context.server.id, force: forced }
            );
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
        let telemetryProps: any = {
            type: context.server.type.id,
            debug: true
        };
        sendTelemetry('server.start', telemetryProps);

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
        let telemetryProps: any = {
            type: context.server.type.id,
        };
        sendTelemetry('server.remove', telemetryProps);

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
        let telemetryProps: any = {
            type: context.server.type.id,
        };
        sendTelemetry('server.output', telemetryProps);
        this.explorer.showOutput(context);
    }

    public async restartServer(mode: string, context?: ServerStateNode): Promise<Protocol.Status> {
        if (context === undefined) {
            const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
            if (!rsp || !rsp.id) return null;
            const serverFilter = server => server.state === ServerState.STARTED;
            const serverId: string = await this.selectServer(rsp.id, 'Select server to restart', serverFilter);
            if (!serverId) return null;
            context = this.explorer.getServerStateById(rsp.id, serverId);
        }
        let telemetryProps: any = {
            type: context.server.type.id,
            mode: mode,
        };
        sendTelemetry('server.restart', telemetryProps);

        const client: RSPClient = this.explorer.getClientByRSP(context.rsp);
        if (!client) {
            return Promise.reject('Failed to contact the RSP server.');
        }

        const listener = this.getRestartListener(mode, context, client);
        client.getIncomingHandler().onServerStateChanged(listener);
        return this.stopServer(false, context).catch(err => {
            // if server fails to stop, remove listener and make error be handled by main catch
            client.getIncomingHandler().removeOnServerStateChanged(listener);
            return Promise.reject(err);
        });
    }

    public getRestartListener(mode: string, context: ServerStateNode, client: RSPClient) {
        const listener = async (state: Protocol.ServerState) => {
            try {
                if (state
                    && state.server
                    && state.server.id === context.server.id
                    && (state.state === ServerState.STOPPED ||
                    state.state === ServerState.STARTED)) {
                    client.getIncomingHandler().removeOnServerStateChanged(listener);
                    if (state.state === ServerState.STOPPED) {
                        switch (mode) {
                        case ServerState.RUN_MODE_DEBUG: {
                            return await this.debugServer(context);
                        }
                        case ServerState.RUN_MODE_RUN: {
                            return await this.startServer(ServerState.RUN_MODE_RUN, context);
                        }
                        default: {
                            vscode.window.showErrorMessage(`Could not restart server: unknown mode ${mode}`);
                        }
                        }
                    } else {
                        vscode.window.showErrorMessage('Could not restart server. Server shutdown failed. Server still started');
                    }
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to restart server. Error- ${err.toLowerCase()}`);
            }
        };
        return listener;
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
            let telemetryProps: any = {
                type: context.server.type.id,
            };
            sendTelemetry('server.addDeployment', telemetryProps);
            return this.explorer.selectAndAddDeployment(context);
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
                                           server.publishState === ServerState.PUBLISH_STATE_FULL ||
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

        let telemetryProps: any = {
            type: context.server.type.id,
        };
        sendTelemetry('server.removeDeployment', telemetryProps);

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
        const isAsync = vscode.workspace.getConfiguration('rsp-ui').get<boolean>(`enableAsyncPublish`);

        let telemetryProps: any = {
            rspType: context.rsp,
            serverType: context.server.type.id,
            publishType: publishType,
            async: isAsync,
        };
        const startTime = Date.now();
        try {
            return this.explorer.publish(context.rsp, context.server, publishType, isAsync);
        } finally {
            telemetryProps.duration = Date.now() - startTime;
            sendTelemetry('server.publish', telemetryProps);
        }
    }

    public async createServer(context?: RSPState): Promise<Protocol.Status | null> {
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

    public async addLocation(rspId: string): Promise<Protocol.Status | null> {
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

        let telemetryProps: any = { rspType: rspId };
        const startTime = Date.now();

        const client = this.explorer.getClientByRSP(rspId);
        if (!client) {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = 'Failed to contact the RSP server.';
            sendTelemetry('server.add.download', telemetryProps);
            return Promise.reject('Failed to contact the RSP server.');
        }

        const rtId: string = await this.promptDownloadableRuntimes(client);
        if (!rtId) {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = 'No runtime selected to download';
            sendTelemetry('server.add.download', telemetryProps);
            return;
        }
        telemetryProps.serverType = rtId;
        let response: Protocol.WorkflowResponse = await this.initEmptyDownloadRuntimeRequest(rtId, client);
        if (!response) {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = 'No response for initial download runtime workflow request';
            sendTelemetry('server.add.download', telemetryProps);
            return;
        }

        try {
            while (true) {
                const workflowMap = {};
                const status = await this.handleWorkflow(response, workflowMap);
                if (!status) {
                    telemetryProps.errorMessage = 'User did not complete download runtime workflow';
                    return;
                } else if (!StatusSeverity.isInfo(status)) {
                    return status;
                }
                // Now we have a data map
                response = await this.initDownloadRuntimeRequest(rtId, workflowMap, response.requestId, client);
            }
        } finally {
            telemetryProps.duration = Date.now() - startTime;
            sendTelemetry('server.add.download', telemetryProps);
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

        const action: ServerActionItem = await this.chooseServerActions(context.server, client);
        if (!action) {
            return;
        }

        let telemetryProps: any = {
            rsp: context.rsp,
            type: context.server.type.id,
        };
        const startTime = Date.now();
        try {
            return await this.executeServerAction(action, context, client);
        } finally {
            telemetryProps.duration = Date.now() - startTime;
            sendTelemetry('server.actions', telemetryProps);
        }
    }

    private async chooseServerActions(server: Protocol.ServerHandle, client: RSPClient): Promise<ServerActionItem> {
        const actionsList: ServerActionItem[] = await client.getOutgoingHandler().listServerActions(server)
           .then((response: Protocol.ListServerActionResponse) => {
               return response.workflows.map(action => {
                   return {
                       label: action.actionLabel,
                       id: action.actionId,
                       actionWorkflow: action.actionWorkflow
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
            return answer;
        }
    }

    private async executeServerAction(action: ServerActionItem, context: ServerStateNode, client: RSPClient): Promise<Protocol.Status> {
        const workflowMap = {};
        const status1 = await this.handleWorkflow(action.actionWorkflow, workflowMap);
        if( !status1) {
            // Only way status1 is undefined is if the user canceled an input, and thus canceled the request
            return;
        }
        const actionRequest: Protocol.ServerActionRequest = {
            actionId: action.id,
            data: workflowMap,
            requestId: null,
            serverId: context.server.id
        };

        let response: Protocol.WorkflowResponse = await client.getOutgoingHandler().executeServerAction(actionRequest);
        if (!response) {
            return;
        }
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

    // Should only return undefined if user cancels
    private async handleWorkflow(response: Protocol.WorkflowResponse, workflowMap?: { [index: string]: any } ): Promise<Protocol.Status> {
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
                const strategy: WorkflowResponseStrategy = new WorkflowResponseStrategyManager().getStrategy(item.itemType);
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

        let telemetryProps: any = {
            rsp: context.rsp,
            type: context.server.type.id,
        };
        sendTelemetry('server.editServer', telemetryProps);

        if (this.explorer) {
            return this.explorer.editServer(context.rsp, context.server);
        } else {
            return Promise.reject('Runtime Server Protocol (RSP) Server is starting, please try again later.');
        }
    }

    public async runOnServer(uri: vscode.Uri, mode?: string): Promise<void> {
        if (!this.explorer) {
            return Promise.reject('Runtime Server Protocol (RSP) Server is starting, please try again later.');
        }
        const rsp = await this.selectRSP('Select RSP provider you want to retrieve servers');
        if (!rsp || !rsp.id) return;
        const serverId = await this.selectServer(rsp.id, 'Select server you want to retrieve info about');
        if (!serverId) return;
        const context = this.explorer.getServerStateById(rsp.id, serverId);


        let telemetryProps: any = {
            rsp: context.rsp,
            type: context.server.type.id,
            mode: mode,
        };
        const startTime = Date.now();
        try {
            return this.runOnServerImpl(context, uri, mode);
        } finally {
            telemetryProps.duration = Date.now() - startTime;
            sendTelemetry('server.runOnServer', telemetryProps);
        }
    }
    public async runOnServerImpl(context:ServerStateNode, uri:vscode.Uri, mode?: string): Promise<void> {

        await this.explorer.addDeployment([uri], context);
        const isAsync = vscode.workspace.getConfiguration('rsp-ui').get<boolean>(`enableAsyncPublish`);
        await this.explorer.publish(context.rsp, context.server, ServerState.PUBLISH_FULL, isAsync);
        if (context.state === ServerState.STOPPED ||
            context.state === ServerState.UNKNOWN) {
            if (mode === ServerState.RUN_MODE_RUN) {
                await this.startServer(mode, context);
            } else {
                await this.debugServer(context);
            }
        } else if (context.state === ServerState.STARTED) {
            if (!(context.runMode === ServerState.RUN_MODE_RUN &&
                mode === ServerState.RUN_MODE_RUN)) {
                await this.restartServer(mode, context);
            }
        } else {
            return Promise.reject(`Unable to add deployment and run it on server ${context.server.id}. Stop/start the server and try again.`);
        }
    }

    public async saveSelectedNode(server: ServerStateNode): Promise<void> {
        this.explorer.nodeSelected = server;
    }

    private async selectRSP(message: string, predicateFilter?: (value: RSPProperties) => unknown): Promise<{ label: string; id: string; }> {
        const vals = Array.from(this.explorer.RSPServersStatus.values());
        const predicateFilter2 = predicateFilter ? predicateFilter : value => value.state.state === ServerState.STARTED;
        const rspProviders = vals.filter(predicateFilter2).map(rsp => {
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
        if (servers.length > 1 &&
            this.explorer.nodeSelected &&
            'deployableStates' in this.explorer.nodeSelected &&
            this.explorer.nodeSelected.rsp === rspId) {
            servers = servers.filter(node => node.server.id !== (this.explorer.nodeSelected as ServerStateNode).server.id);
            servers.unshift(this.explorer.nodeSelected);
        }
        return vscode.window.showQuickPick(servers.map(server => server.server.id), { placeHolder: message });
    }

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
