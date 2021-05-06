/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';

import {
    Event,
    EventEmitter,
    InputBoxOptions,
    OpenDialogOptions,
    OutputChannel,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    TreeView,
    TreeViewVisibilityChangeEvent,
    Uri,
    window,
    workspace
} from 'vscode';
import { myContext } from './extension';

import {
    Protocol,
    RSPClient,
    ServerState,
    StatusSeverity
} from 'rsp-client';
import { ServerEditorAdapter } from './serverEditorAdapter';
import { Utils } from './utils/utils';
import { RSPType, ServerInfo } from 'vscode-server-connector-api';
import sendTelemetry from './telemetry';
import { IWizardPage, Template, WebviewWizard, WizardDefinition,WizardPageFieldDefinition, WizardPageSectionDefinition } from '@redhat-developer/vscode-wizard';
import { PerformFinishResponse } from '@redhat-developer/vscode-wizard/lib/IWizardWorkflowManager';

enum deploymentStatus {
    file = 'File',
    exploded = 'Exploded'
}

export interface DeployableStateNode {
    rsp: string;
    server: Protocol.ServerHandle;
    reference: Protocol.DeployableReference;
    state: number;
    publishState: number;
}

export interface ServerStateNode {
    rsp: string;
    server: Protocol.ServerHandle;
    state: number;
    publishState: number;
    runMode: string;
    deployableStates: DeployableStateNode[];
}

export interface RSPState {
    type: RSPType;
    state: number;
    serverStates: ServerStateNode[];
}

export interface RSPProperties {
    state: RSPState;
    rspserverstdout: OutputChannel;
    rspserverstderr: OutputChannel;
    client: RSPClient;
    info: ServerInfo;
}

export class ServerExplorer implements TreeDataProvider<RSPState | ServerStateNode | DeployableStateNode> {

    private static instance: ServerExplorer;
    private _onDidChangeTreeData: EventEmitter<RSPState | ServerStateNode | undefined> = new EventEmitter<RSPState | ServerStateNode | undefined>();
    public readonly onDidChangeTreeData: Event<RSPState | ServerStateNode | undefined> = this._onDidChangeTreeData.event;
    public serverOutputChannels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
    public runStateEnum: Map<number, string> = new Map<number, string>();
    public publishStateEnum: Map<number, string> = new Map<number, string>();
    private serverAttributes: Map<string, {required: Protocol.Attributes, optional: Protocol.Attributes}> =
        new Map<string, {required: Protocol.Attributes, optional: Protocol.Attributes}>();
    private readonly viewer: TreeView< RSPState | ServerStateNode | DeployableStateNode>;
    public RSPServersStatus: Map<string, RSPProperties> = new Map<string, RSPProperties>();
    public nodeSelected: RSPState | ServerStateNode;

    private constructor() {
        this.viewer = window.createTreeView('servers', { treeDataProvider: this });
        this.viewer.onDidChangeVisibility(this.changeViewer, this);

        this.runStateEnum
            .set(0, 'Unknown')
            .set(1, 'Starting')
            .set(2, 'Started')
            .set(3, 'Stopping')
            .set(4, 'Stopped');

        this.publishStateEnum
            .set(1, 'Synchronized')
            .set(2, 'Publish Required')
            .set(3, 'Full Publish Required')
            .set(4, '+ Publish Required')
            .set(5, '- Publish Required')
            .set(6, 'Unknown');
    }

    public static getInstance(): ServerExplorer {
        if (!this.instance) {
            this.instance = new ServerExplorer();
        }

        return this.instance;
    }

    public async initRSPNode(rspId: string) {
        const client: RSPClient = this.getClientByRSP(rspId);
        if (client) {
            const servers: Protocol.ServerHandle[] = await client.getOutgoingHandler().getServerHandles();
            for (const serverHandle of servers) {
                const state = await client.getOutgoingHandler().getServerState(serverHandle);
                const serverNode: ServerStateNode = this.convertToServerStateNode(rspId, state);
                this.RSPServersStatus.get(rspId).state.serverStates.push(serverNode);
            }
        }

        this.refresh(this.RSPServersStatus.get(rspId).state);
    }

    public async insertServer(rspId: string, event: Protocol.ServerHandle) {
        const client: RSPClient = this.getClientByRSP(rspId);
        if (client) {
            const state = await client.getOutgoingHandler().getServerState(event);
            const serverNode: ServerStateNode = this.convertToServerStateNode(rspId, state);
            if (serverNode) {
                this.RSPServersStatus.get(rspId).state.serverStates.push(serverNode);
                this.refresh(this.RSPServersStatus.get(rspId).state);
                this.selectNode({rsp: rspId, ...state } as ServerStateNode);
            }
        }
    }

    public updateRSPServer(rspId: string, state: number) {
        this.RSPServersStatus.get(rspId).state.state = state;
        this.refresh(this.RSPServersStatus.get(rspId).state);
    }

    public updateServer(rspId: string, event: Protocol.ServerState): void {
        const indexServer: number = this.RSPServersStatus.get(rspId).state.serverStates.
                                            findIndex(state => state.server.id === event.server.id);
        const serverToUpdate: ServerStateNode = this.RSPServersStatus.get(rspId).state.serverStates[indexServer];
        // update serverToUpdate based on event
        Object.keys(event).forEach(key => {
            if (key in serverToUpdate || key === 'runMode') {
                serverToUpdate[key] = event[key];
            }
        });
        serverToUpdate.deployableStates = this.convertToDeployableStateNodes(rspId, event.deployableStates);
        this.RSPServersStatus.get(rspId).state.serverStates[indexServer] = serverToUpdate;
        this.refresh(serverToUpdate);
        const channel: OutputChannel = this.serverOutputChannels.get(event.server.id);
        if (event.state === ServerState.STARTING && channel) {
            channel.clear();
        }
    }

    private convertToServerStateNode(rspId: string, state: Protocol.ServerState): ServerStateNode {
        if (state) {
            const deployableNodes: DeployableStateNode[] = this.convertToDeployableStateNodes(rspId, state.deployableStates);
            return {
                ...state,
                rsp: rspId,
                deployableStates: deployableNodes
            } as ServerStateNode;
        }

        return undefined;
    }

    private convertToDeployableStateNodes(rspId: string, states: Protocol.DeployableState[]): DeployableStateNode[] {
        const deployableNodes: DeployableStateNode[] = [];
        if (states && states.length > 0) {
            for (const deployable of states) {
                const deployableNode: DeployableStateNode = {rsp: rspId, ...deployable};
                deployableNodes.push(deployableNode);
            }
        }

        return deployableNodes;
    }

    public removeServer(rspId: string, handle: Protocol.ServerHandle): void {
        this.RSPServersStatus.get(rspId).state.serverStates = this.RSPServersStatus.get(rspId).state.serverStates.
                                                                        filter(state => state.server.id !== handle.id);
        this.refresh(this.RSPServersStatus.get(rspId).state);
        const channel: OutputChannel = this.serverOutputChannels.get(handle.id);
        this.serverOutputChannels.delete(handle.id);
        if (channel) {
            channel.clear();
            channel.dispose();
        }
    }

    public addServerOutput(output: Protocol.ServerProcessOutput): void {
        let channel: OutputChannel = this.serverOutputChannels.get(output.server.id);
        if (channel === undefined) {
            channel = window.createOutputChannel(`Server: ${output.server.id}`);
            this.serverOutputChannels.set(output.server.id, channel);
        }
        channel.append(output.text);
        if (workspace.getConfiguration('vscodeAdapters').get<boolean>('showChannelOnServerOutput')) {
            channel.show();
        }
    }

    public showOutput(state: ServerStateNode): void {
        const channel: OutputChannel = this.serverOutputChannels.get(state.server.id);
        if (channel && workspace.getConfiguration('vscodeAdapters').get<boolean>('showChannelOnServerOutput')) {
            channel.show();
        }
    }

    public refresh(data?: RSPState | ServerStateNode): void {
        this._onDidChangeTreeData.fire(data);
        if (data !== undefined && this.isServerElement(data)) {
            this.selectNode(data);
        }
    }

    public selectNode(data: RSPState | ServerStateNode): void {
        this.nodeSelected = data;
        const tmpViewer = this.viewer;
        tmpViewer.reveal(data, { focus: true, select: true });
    }

    private changeViewer(_e: TreeViewVisibilityChangeEvent) {
        if (!this.viewer.visible) {
            return;
        }
        const tmpViewer = this.viewer;
        if (this.nodeSelected) {
            tmpViewer.reveal(this.nodeSelected, { focus: true, select: true });
        }
    }

    public async selectAndAddDeployment(state: ServerStateNode): Promise<Protocol.Status> {
        return this.createOpenDialogOptions()
            .then(options => options && window.showOpenDialog(options))
            .then(async file => this.addDeployment(file, state));
    }

    public async addDeployment(file: Uri[], state: ServerStateNode): Promise<Protocol.Status> {
        const client: RSPClient = this.RSPServersStatus.get(state.rsp).client;
        if (client && file && file.length === 1) {

            const options = await this.getDeploymentOptions(client, state);
            if (!options) {
                return;
            }

            // var fileUrl = require('file-url');
            // const filePath : string = fileUrl(file[0].fsPath);
            const deployableRef: Protocol.DeployableReference = {
                label: file[0].fsPath,
                path: file[0].fsPath,
                options: options
            };
            const req: Protocol.ServerDeployableReference = {
                server: state.server,
                deployableReference : deployableRef
            };
            const status = await client.getOutgoingHandler().addDeployable(req);
            if (!StatusSeverity.isOk(status)) {
                return Promise.reject(status.message);
            }
            return status;
        }
    }

    private async createOpenDialogOptions(): Promise<OpenDialogOptions> {
        const showQuickPick: boolean = process.platform === 'win32' ||
                                       process.platform === 'linux';
        const filePickerType = await this.quickPickDeploymentType(showQuickPick);
        if (!filePickerType) {
            return;
        }
        // dialog behavior on different OS
        // Windows -> if both options (canSelectFiles and canSelectFolders) are true, fs only shows folders
        // Linux(fedora) -> if both options are true, fs shows both files and folders but files are unselectable
        // Mac OS -> if both options are true, it works correctly

        let activeEditorUri = window.activeTextEditor === undefined ? undefined : 
                            window.activeTextEditor.document === undefined ? undefined : 
                            window.activeTextEditor.document.uri;
        if (activeEditorUri && activeEditorUri.scheme && activeEditorUri.scheme === 'output') {
            activeEditorUri = undefined;
        }
        const workspaceFolderUri =  (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) 
                                    ? workspace.workspaceFolders[0].uri : undefined;
        const workspaceFileUri = workspace.workspaceFile === undefined ? undefined :
                                    workspace.workspaceFile.scheme === 'file' ? workspace.workspaceFile : undefined;
        const uriToOpen = workspaceFolderUri !== undefined ? workspaceFolderUri :
                        workspaceFileUri !== undefined ? workspaceFileUri : activeEditorUri;
        return {
            defaultUri: uriToOpen,
            canSelectFiles: (showQuickPick ? filePickerType === deploymentStatus.file : true),
            canSelectMany: false,
            canSelectFolders: (showQuickPick ? filePickerType === deploymentStatus.exploded : true),
            openLabel: `Select ${filePickerType} Deployment`
        };
    }

    private async getDeploymentOptions(client: RSPClient, state: ServerStateNode): Promise<object> {
        const answer = await window.showQuickPick(['No', 'Yes'], {placeHolder:
            'Do you want to edit optional deployment parameters?'});
        const options = {};
        if (!answer) {
            return;
        }
        if (answer === 'Yes') {
            const deployOptionsResponse: Protocol.ListDeploymentOptionsResponse =
                await client.getOutgoingHandler().listDeploymentOptions(state.server);
            const optionMap: Protocol.Attributes = deployOptionsResponse.attributes;
            for (const key in optionMap.attributes) {
                if (key) {
                    const attribute = optionMap.attributes[key];
                    const val = await window.showInputBox({prompt: attribute.description,
                        value: attribute.defaultVal, password: attribute.secret});
                    if (val) {
                        options[key] = val;
                    }
                }
            }
        }

        return options;
    }

    public async removeDeployment(rspId: string, server: Protocol.ServerHandle, deployableRef: Protocol.DeployableReference): Promise<Protocol.Status> {
        const client: RSPClient = this.getClientByRSP(rspId);
        if (!client) {
            return Promise.reject('Unable to contact the RSP server.');
        }
        const req: Protocol.ServerDeployableReference = {
            server: server,
            deployableReference : deployableRef
        };
        const status = await client.getOutgoingHandler().removeDeployable(req);
        if (!StatusSeverity.isOk(status)) {
            return Promise.reject(status.message);
        }
        return status;
    }

    public async publish(rspId: string, server: Protocol.ServerHandle, type: number, isAsync: boolean): Promise<Protocol.Status> {
        const client: RSPClient = this.getClientByRSP(rspId);
        if (!client) {
            return Promise.reject('Unable to contact the RSP server.');
        }
        const req: Protocol.PublishServerRequest = { server: server, kind : type};
        let status: Protocol.Status;
        if (isAsync) {
            status = await client.getOutgoingHandler().publishAsync(req);
        } else {
            status = await client.getOutgoingHandler().publish(req);
        }
        if (!StatusSeverity.isOk(status)) {
            return Promise.reject(status.message);
        }
        return status;
    }

    public async addLocation(rspId: string): Promise<Protocol.Status | null> {
        let telemetryProps: any = { rspType: rspId }
        const startTime: number = Date.now();

        const client: RSPClient = this.getClientByRSP(rspId);
        if (!client) {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = 'Unable to contact the RSP server.';
            sendTelemetry('server.add.local', telemetryProps);
            return Promise.reject('Unable to contact the RSP server.');
        }
        const folders = await window.showOpenDialog({
            canSelectFiles: false,
            canSelectMany: false,
            canSelectFolders: true,
            openLabel: 'Select desired server location'
        } as OpenDialogOptions);

        if (!folders
          || folders.length === 0) {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = 'User canceled browse to server home';
            sendTelemetry('server.add.local', telemetryProps);
            return;
        }

        const serverBeans: Protocol.ServerBean[] =
          await client.getOutgoingHandler().findServerBeans({ filepath: folders[0].fsPath });

        if (!serverBeans
          || serverBeans.length === 0
          || !serverBeans[0].serverAdapterTypeId
          || !serverBeans[0].typeCategory
          || serverBeans[0].typeCategory === 'UNKNOWN') {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = `Could not detect any server at ${folders[0].fsPath}!`;
            sendTelemetry('server.add.local', telemetryProps);
            throw new Error(`Could not detect any server at ${folders[0].fsPath}!`);
        }

        const useWebviews = workspace.getConfiguration('rsp-ui').get<boolean>(`newserverwebviewworkflow`);
        if( useWebviews ) {
            return this.addLocationWizardImplementation(serverBeans[0], rspId, client, telemetryProps, startTime);
        } else {
            return this.addLocationStepImplementation(serverBeans[0], rspId, client, telemetryProps, startTime);
        }
    }

    private attrTypeToFieldDefinitionType(attr: Protocol.Attribute): string {
        if( attr.type === 'bool' )
            return "checkbox";
        if( attr.type === 'int') 
            return "number";
        if( attr.type === 'list')
            return "textarea";
        if( attr.type === 'map')
            return "textarea";
        // if( attr.type === 'int' || attr.type === 'string')  or other
        return "textbox";
    }
    private attrAsFieldDefinition(key: string, attr: Protocol.Attribute, required: boolean ) : WizardPageFieldDefinition {
        const ret: WizardPageFieldDefinition = {
            id: key,
            label: key + (required ? "*" : ""),
            description: attr.description,
            type: this.attrTypeToFieldDefinitionType(attr),
            initialValue: attr.defaultVal
        };
        return ret;
    }

    public getDefaultServerName(rspId: string, serverType: Protocol.ServerType) : string {
        let count: number = 0;
        let needle = serverType.visibleName;
        let done: boolean = false;
        while (!done) {
            let found = this.RSPServersStatus.get(rspId).state.serverStates.find(state => state.server.id === needle);
            if( found !== undefined ) {
                needle = serverType.visibleName + " (" + ++count + ")";
            } else {
                done = true;
            }
        }
        return needle;
    }

    public async addLocationWizardImplementation(serverBean: Protocol.ServerBean, rspId: string,
        client: RSPClient, telemetryProps: any, startTime: number): Promise<Protocol.Status | null> {

            let serverType: Protocol.ServerType = null;
            const serverTypes: Protocol.ServerType[] = await client.getOutgoingHandler().getServerTypes();
            for( const oneType of serverTypes ) {
                if( oneType.id === serverBean.serverAdapterTypeId ) {
                    serverType = oneType;
                }
            }

            const req: Protocol.Attributes = await client.getOutgoingHandler().getRequiredAttributes({id: serverBean.serverAdapterTypeId, visibleName: '', description: ''});
            const opt: Protocol.Attributes = await client.getOutgoingHandler().getOptionalAttributes({id: serverBean.serverAdapterTypeId, visibleName: '', description: ''});


            let initialData: Map<string,string> = new Map<string,string>();
            let defaultName: string = this.getDefaultServerName(rspId, serverType);
            let fields:  (WizardPageFieldDefinition | WizardPageSectionDefinition)[] = [];
            let nameField: WizardPageFieldDefinition = {
                id: "id",
                type: "textbox",
                label: "Server Name*",
                initialValue: defaultName
            };
            fields.push(nameField);
            initialData['id'] = defaultName;

            let requiredFields: WizardPageFieldDefinition[] = [];
            let optionalFields: WizardPageFieldDefinition[] = [];
            
            for( const key in req.attributes ) {
                const oneAttr: Protocol.Attribute = req.attributes[key];
                let f1: WizardPageFieldDefinition = this.attrAsFieldDefinition(key, oneAttr, true);
                if (key === 'server.home.dir' || key === 'server.home.file') {
                    f1.initialValue = serverBean.location;
                    f1.properties = {disabled: true};
                    initialData[key] = f1.initialValue;
                }
                requiredFields.push(f1);
            }

            for( const key in opt.attributes ) {
                const oneAttr: Protocol.Attribute = opt.attributes[key];
                let f1: WizardPageFieldDefinition = this.attrAsFieldDefinition(key, oneAttr, false);
                optionalFields.push(f1);
            }

            let requiredSection: WizardPageSectionDefinition = {
                id: 'requiredSection',
                label: "Required Attributes",
                description: "Please fill in all of the following required attributes.",
                childFields: requiredFields
            }

            let optionalSection: WizardPageSectionDefinition = {
                id: 'optionalSection',
                label: "Optional Attributes",
                description: "Fill in or override any of the following optional attributes as you require.",
                childFields: optionalFields
            }
            fields.push(requiredSection);
            fields.push(optionalSection);

            const explorer: ServerExplorer = this;
            let def : WizardDefinition = {
                title: "New Server: " + serverType.visibleName, 
                description: serverType.description,
                bannerIconString: "<img style=\"float: right;\" src=\"data:image/png;base64,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\">",
                pages: [
                  {
                    id: "newServerPage1",
                    title: "Server Properties ", 
                    description: "Fill in required and optional properties to create your server adapter.",
                    fields: fields,
                    validator: (parameters:any) => {
                        let errors: Template[] = [];
                        for( const key in req.attributes ) {
                            if( !parameters[key] || parameters[key] === "") {
                              errors.push({ id: key+"Validation", 
                              content: (key+" must not be empty.")});
                            }
                        }
                        // Type validation
                        for( const key in req.attributes ) {
                          if( parameters[key] && parameters[key] !== "") {
                              let err: string = this.validateWizardDataType(req.attributes[key].type, parameters[key]);
                              if( err !== null ) {
                                  errors.push({ id: key+"Validation", 
                                  content: (key+" " + err)});
                              }
                              console.log(err);
                          }
                        }
                        for( const key in opt.attributes ) {
                          if( parameters[key] && parameters[key] !== "") {
                              let err: string = this.validateWizardDataType(opt.attributes[key].type, parameters[key]);
                              if( err !== null ) {
                                  errors.push({ id: key+"Validation", 
                                  content: (key+" " + err)});
                              }
                          }
                        }

                        if( !parameters['id'] || parameters['id'] === "") {
                          errors.push({ id: "idValidation", 
                          content: ("id must not be empty.")});
                        }
                        return {
                            errors: errors
                        }
                    }
                }
                ],
                workflowManager: {
                    canFinish(wizard:WebviewWizard, data: any): boolean {
                        if( !data['id'] || data['id'] === "") {
                            return false;
                        }
                        for( const key in req.attributes ) {
                            if( !data[key] || data[key] === "") {
                                return false;
                            }
                        }
                        return true;
                    },
                    async performFinish(wizard:WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
                        try {
                            let resp: Protocol.CreateServerResponse = await explorer.createServerFullResponse(serverBean, data.id, data, client);
                            if( resp.status.ok || resp.status.severity == 0) {
                                return null;
                            }
                            let templates = [];
                            for( const key in resp.invalidKeys ) {
                                templates.push({ id: resp.invalidKeys[key]+"Validation", 
                                content: (resp.invalidKeys[key]+" contains an invalid value")});
                            }
                            return {
                                close: false,
                                returnObject: {},
                                templates: templates
                            };
                        } catch( e ) {
                            return {
                                close: false,
                                returnObject: {},
                                templates: [
                                    { id: "description", content: (e)},
                                ]
                            };
                        }
                    },
                    getNextPage(page:IWizardPage, data: any): IWizardPage | null {
                        return null;
                    },
                    getPreviousPage(page:IWizardPage, data: any): IWizardPage | null {
                        return null;
                    }
                }
            };

            const wiz: WebviewWizard = new WebviewWizard("New Server Wizard", "NewServerWizard", 
                myContext, def, initialData);
            wiz.open();
            return null;
    }

    private validateWizardDataType(expected:string, val:any): string | null {
        if( 'bool' == expected ) {
            if( typeof val === 'boolean')
                return null;
            if(typeof val === 'string' && ((/true/i).test(val) || (/false/i).test(val)))
                return null;
            return 'Value must be a boolean';
        }
        if( 'int' == expected ) {
            if( typeof val === 'number')
                return null;
            if( typeof val === 'string') {
                const isNumber = !isNaN(parseFloat(val)) && isFinite(Number(val));
                if( isNumber)
                    return null;
            }
            return 'Value must be an integer';
        }
        return null;
    }
    public showAddServerWizardFinishResult(stat: Protocol.Status ) {
        console.log(stat);
    }
    public async addLocationStepImplementation(serverBean: Protocol.ServerBean, rspId: string,
            client: RSPClient, telemetryProps: any, startTime: number): Promise<Protocol.Status> {
        const server: { name: string, bean: Protocol.ServerBean } = { name: null, bean: null };
        server.bean = serverBean;
        server.name = await this.getServerName(rspId);
        if (!server.name) {
            telemetryProps.duration = Date.now() - startTime;
            telemetryProps.errorMessage = 'User canceled when adding server name';
            sendTelemetry('server.add.local', telemetryProps);
            return;
        }
        telemetryProps.serverType = server.bean.serverAdapterTypeId;
        try {
            const attrs = await this.getRequiredParameters(server.bean, client);
            await this.getOptionalParameters(server.bean, attrs);
            return this.createServer(server.bean, server.name, attrs, client);
        } finally {
            telemetryProps.duration = Date.now() - startTime;
            sendTelemetry('server.add.local', telemetryProps);
        }

    }

    public async editServer(rspId: string, server: Protocol.ServerHandle): Promise<void> {
        const client: RSPClient = this.getClientByRSP(rspId);
        if (!client) {
            return Promise.reject(`Unable to contact the RSP server ${rspId}.`);
        }
        const serverProperties = await client.getOutgoingHandler().getServerAsJson(server);

        if (!serverProperties || !serverProperties.serverJson ) {
            return Promise.reject(`Could not load server properties for server ${server.id}`);
        }

        return ServerEditorAdapter.getInstance(this).showServerJsonResponse(rspId, serverProperties);
    }

    public async saveServerProperties(rspId: string, serverhandle: Protocol.ServerHandle, content: string): Promise<Protocol.UpdateServerResponse> {
        if (!serverhandle) {
            return Promise.reject('Unable to update server properties - Invalid server');
        }
        if (!content) {
            return Promise.reject(`Unable to update server properties for server ${serverhandle.id} - Invalid content`);
        }
        const client: RSPClient = this.getClientByRSP(rspId);
        if (!client) {
            return Promise.reject('Unable to contact the RSP server.');
        }
        const serverProps: Protocol.UpdateServerRequest = {
            handle: serverhandle,
            serverJson: content
        };
        const response = await client.getOutgoingHandler().updateServer(serverProps);
        if (!StatusSeverity.isOk(response.validation.status)) {
            return Promise.reject(response);
        }
        return response;
    }

    private async createServer(bean: Protocol.ServerBean, name: string, attributes: any = {}, client: RSPClient): Promise<Protocol.Status> {
        if (!bean || !name) {
            return Promise.reject('Couldn\'t create server: no type or name provided.');
        }
        const response = await client.getServerCreation().createServerFromBeanAsync(bean, name, attributes);
        if (!StatusSeverity.isOk(response.status)) {
            return Promise.reject(response.status.message);
        }
        return response.status;
    }

    private async createServerFullResponse(bean: Protocol.ServerBean, name: string, 
                attributes: any = {}, client: RSPClient): Promise<Protocol.CreateServerResponse> {
        if (!bean || !name) {
            return Promise.reject('Couldn\'t create server: no type or name provided.');
        }
        return await client.getServerCreation().createServerFromBeanAsync(bean, name, attributes);
    }

    public getClientByRSP(rspId: string): RSPClient {
        if (!this.RSPServersStatus.has(rspId)) {
            return undefined;
        }
        return this.RSPServersStatus.get(rspId).client;
    }

    public getRSPOutputChannel(server: string): OutputChannel {
        if (!this.RSPServersStatus.has(server)) {
            return undefined;
        }
        return this.RSPServersStatus.get(server).rspserverstdout;
    }

    public getRSPErrorChannel(server: string): OutputChannel {
        if (!this.RSPServersStatus.has(server)) {
            return undefined;
        }
        return this.RSPServersStatus.get(server).rspserverstderr;
    }

    public disposeRSPProperties(rspId: string) {
        if (!this.RSPServersStatus.has(rspId)) {
            return;
        }

        const rspProps = this.RSPServersStatus.get(rspId);
        if (rspProps.client) {
            rspProps.client.disconnect();
        }
        if (rspProps.rspserverstdout) {
            rspProps.rspserverstdout.dispose();
        }
        if (rspProps.rspserverstderr) {
            rspProps.rspserverstderr.dispose();
        }

        this.RSPServersStatus.get(rspId).state.serverStates = undefined;
    }

    /**
     * Prompts for server name
     */
    private async getServerName(rspId: string): Promise<string> {
        const options: InputBoxOptions = {
            prompt: `Provide the server name`,
            placeHolder: `Server name`,
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return 'Cannot set empty server name';
                }
                if (this.RSPServersStatus.get(rspId).state.serverStates.find(state => state.server.id === value)) {
                    return 'Cannot set duplicate server name';
                }
            }
        };
        return await window.showInputBox(options);
    }

    /**
     * Requests parameters for the given server and lets user fill the required ones
     */
    private async getRequiredParameters(bean: Protocol.ServerBean, client: RSPClient): Promise<object> {
        let serverAttribute: {required: Protocol.Attributes; optional: Protocol.Attributes};

        if (this.serverAttributes.has(bean.serverAdapterTypeId)) {
            serverAttribute = this.serverAttributes.get(bean.serverAdapterTypeId);
        } else {
            const req = await client.getOutgoingHandler().getRequiredAttributes({id: bean.serverAdapterTypeId, visibleName: '', description: ''});
            const opt = await client.getOutgoingHandler().getOptionalAttributes({id: bean.serverAdapterTypeId, visibleName: '', description: ''});
            serverAttribute = { required: req, optional: opt };

            this.serverAttributes.set(bean.serverAdapterTypeId, serverAttribute);
        }
        const attributes = {};
        if (serverAttribute.required
            && serverAttribute.required.attributes
            && Object.keys(serverAttribute.required.attributes).length > 0) {
            for (const key in serverAttribute.required.attributes) {
                if (key !== 'server.home.dir' && key !== 'server.home.file') {
                    const attribute = serverAttribute.required.attributes[key];
                    const value = await window.showInputBox({prompt: attribute.description,
                        value: attribute.defaultVal, password: attribute.secret});
                    if (value) {
                        attributes[key] = value;
                    }
                } else {
                    attributes[key] = bean.location;
                }
            }
        }
        return attributes;
    }

    /**
     * Let user choose to fill in optional parameters for a server
     */
    private async getOptionalParameters(bean: Protocol.ServerBean, attributes: object): Promise<object> {
        const serverAttribute = this.serverAttributes.get(bean.serverAdapterTypeId);
        if (serverAttribute.optional
              && serverAttribute.optional.attributes
              && Object.keys(serverAttribute.optional.attributes).length > 0) {
            const answer = await window.showQuickPick(['No', 'Yes'], {placeHolder: 'Do you want to edit optional parameters ?'});
            if (answer === 'Yes') {
                for (const key in serverAttribute.optional.attributes) {
                    if (key !== 'server.home.dir' && key !== 'server.home.file') {
                        const attribute = serverAttribute.optional.attributes[key];
                        const val = await window.showInputBox({prompt: attribute.description,
                            value: attribute.defaultVal, password: attribute.secret});
                        if (val) {
                            attributes[key] = val;
                        }
                    } else {
                        attributes[key] = bean.location;
                    }
                }
            }
        }
        return attributes;
    }

    private async quickPickDeploymentType(showQuickPick: boolean): Promise<string> {
        // quickPick to solve a vscode api bug in windows that only opens file-picker dialog either in file or folder mode
        if (showQuickPick) {
            return await window.showQuickPick([deploymentStatus.file, deploymentStatus.exploded], {placeHolder:
                'What type of deployment do you want to add?'});
        }
        return 'file or exploded';
    }

    public async getTreeItem(item: RSPState | ServerStateNode |  DeployableStateNode): Promise<TreeItem> {
        if (this.isRSPElement(item)) {
            const state: RSPState = item as RSPState;
            const id1: string = state.type.visibilename;
            // TODO fix the run state here, but need to find the RSPProperties for this RSPState
            const props: RSPProperties = this.RSPServersStatus.get(state.type.id);
            const useConnected = (state.state == 2 && props.info !== undefined && props.info.spawned == false);
            const serverState = useConnected ? `Connected` : `${this.runStateEnum.get(state.state)}`;
            const icon = await Utils.getIcon(state.type.id, state.type.id);
            return { label: `${id1}`,
                description: `(${serverState})`,
                id: id1,
                iconPath: icon,
                contextValue: `RSP${serverState}`,
                collapsibleState: TreeItemCollapsibleState.Expanded
            };
        } else if (this.isServerElement(item)) {
            // item is a serverState
            const state: ServerStateNode = item as ServerStateNode;
            const handle: Protocol.ServerHandle = state.server;
            const id1: string = handle.id;
            const serverState: string = (state.state === ServerState.STARTED && state.runMode === ServerState.RUN_MODE_DEBUG) ?
                                    'Debugging' :
                                    this.runStateEnum.get(state.state);
            const pubState: string = this.publishStateEnum.get(state.publishState);
            const icon = await Utils.getIcon(state.rsp, handle.type.id);
            return { label: `${id1}`,
                description: `(${serverState}) (${pubState})`,
                id: `${state.rsp}-${id1}`,
                iconPath: icon,
                contextValue: serverState,
                collapsibleState: TreeItemCollapsibleState.Expanded,
                command: {
                    command: 'server.saveSelectedNode',
                    title: '',
                    tooltip: '',
                    arguments: [ state ]
                }
            };
        } else if (this.isDeployableElement(item)) {
            const state: DeployableStateNode = item as DeployableStateNode;
            const id1: string = state.reference.label;
            const serverState: string = this.runStateEnum.get(state.state);
            const pubState: string = this.publishStateEnum.get(state.publishState);
            const icon = await Utils.getIcon(state.rsp, state.server.type.id);
            return { label: `${id1}`,
                description: `(${serverState}) (${pubState})`,
                iconPath: icon,
                contextValue: pubState,
                collapsibleState: TreeItemCollapsibleState.None
            };
        } else {
            return undefined;
        }
    }

    public getChildren(element?:  RSPState | ServerStateNode | DeployableStateNode):  RSPState[] | ServerStateNode[] | DeployableStateNode[] {
        if (element === undefined) {
            // no parent, root node -> return rsps
            return Array.from(this.RSPServersStatus.values()).map(rsp => rsp.state);
        } else if (this.isRSPElement(element) && (element as RSPState).serverStates !== undefined) {
            // rsp parent -> return servers
            return (element as RSPState).serverStates;
        } else if (this.isServerElement(element) && (element as ServerStateNode).deployableStates !== undefined) {
            // server parent -> return deployables
            return (element as ServerStateNode).deployableStates;
        } else {
            return [];
        }
    }

    public getParent(element?:  RSPState | ServerStateNode | DeployableStateNode): RSPState | ServerStateNode | DeployableStateNode {
        if (this.isServerElement(element)) {
            return this.RSPServersStatus.get((element as ServerStateNode).rsp).state;
        } else if (this.isDeployableElement(element)) {
            const rspId = (element as DeployableStateNode).rsp;
            return this.RSPServersStatus.get(rspId).state.serverStates.find(state => state.server.id === (element as DeployableStateNode).server.id);
        } else {
            return undefined;
        }
    }

    public getServerStateById(rspId: string, serverId: string): ServerStateNode {
        return this.RSPServersStatus.get(rspId).state.serverStates.find(x => x.server.id === serverId);
    }

    public getServerStatesByRSP(rspId: string): ServerStateNode[] {
        return this.RSPServersStatus.get(rspId).state.serverStates;
    }

    private isRSPElement(element: RSPState | ServerStateNode | DeployableStateNode): boolean {
        return (element as RSPState).type !== undefined;
    }

    private isServerElement(element: RSPState | ServerStateNode | DeployableStateNode): boolean {
        return (element as ServerStateNode).deployableStates !== undefined;
    }

    private isDeployableElement(element: RSPState | ServerStateNode | DeployableStateNode): boolean {
        return (element as DeployableStateNode).reference !== undefined;
    }
}
