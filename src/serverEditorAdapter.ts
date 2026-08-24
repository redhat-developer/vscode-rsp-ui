/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';
import * as fs from 'fs';
import { Protocol } from 'rsp-client';
import { ServerExplorer } from './serverExplorer';
import * as tmp from 'tmp';
import * as vscode from 'vscode';

export interface ServerProperties {
    server: string;
    file: string;
}

export const RSP_READONLY_SCHEME = 'rsp-readonly';

export class ReadonlyContentProvider implements vscode.TextDocumentContentProvider {
    private contents = new Map<string, string>();
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;

    public setContent(uri: vscode.Uri, content: string): void {
        this.contents.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) || '';
    }
}

export class ServerEditorAdapter {

    private static instance: ServerEditorAdapter;
    public RSPServerProperties: Map<string, ServerProperties[]> = new Map<string, ServerProperties[]>();
    private readonly PREFIX_TMP = 'tmpServerConnector';
    public readonly contentProvider = new ReadonlyContentProvider();

    private constructor(private explorer: ServerExplorer) {
    }

    public static getInstance(explorer: ServerExplorer) : ServerEditorAdapter {
        if (!ServerEditorAdapter.instance) {
            ServerEditorAdapter.instance = new ServerEditorAdapter(explorer);
        }
        return ServerEditorAdapter.instance;
    }

    public async showEditor(fileSuffix: string, content: string, path?: string) : Promise<void> {
        if (!path) {
            const uri = vscode.Uri.parse(`${RSP_READONLY_SCHEME}:${fileSuffix}`);
            this.contentProvider.setContent(uri, content);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, { preview: true });
        } else {
            await vscode.workspace.openTextDocument(path).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }

    public async showServerJsonResponse(rspId: string, content: Protocol.GetServerJsonResponse): Promise<void> {
        if (!content || !content.serverHandle || !content.serverJson) {
            return Promise.reject('Could not handle server response: empty/invalid response');
        }

        const rspExists: boolean = this.RSPServerProperties.has(rspId);
        if (rspExists) {
            const serverProps: ServerProperties = this.RSPServerProperties.get(rspId).find(prop => prop.server === content.serverHandle.id);
            if (serverProps) {
                return this.saveAndShowEditor(
                    serverProps.file,
                    content.serverJson
                );
            }
        }

        return this.createTmpFile(rspExists, rspId, content);
    }

    private async createTmpFile(rspExists: boolean, rspId: string, content: Protocol.GetServerJsonResponse): Promise<void> {
        return tmp.file({ prefix: `${this.PREFIX_TMP}-${content.serverHandle.id}-` , postfix: '.json' }, (err, path) => {
            if (err) {
                return Promise.reject('Could not handle server response. Unable to create temp file');
            }
            if (rspExists) {
                this.RSPServerProperties.get(rspId).push({ server: content.serverHandle.id, file: path});
            } else {
                this.RSPServerProperties.set(rspId, [{ server: content.serverHandle.id, file: path}]);
            }
            this.saveAndShowEditor(path, content.serverJson);
        });
    }

    private async saveAndShowEditor(path: string, content: string): Promise<void> {
        fs.writeFile(path, content, undefined, error => {
            if (error !== null) {
                return Promise.reject(`Unable to save file on path ${path}. Error - ${error}`);
            }
        });

        vscode.workspace.openTextDocument(path).then(doc =>
            vscode.window.showTextDocument(doc)
        );
    }

    public async onDidSaveTextDocument(doc: vscode.TextDocument): Promise<Protocol.Status> {
        if (!doc) {
            return Promise.reject('Unable to save server properties');
        }

        if (!doc.uri || !doc.uri.fsPath) {
            return Promise.reject('Unable to save server properties - Uri is invalid');
        }

        if (await this.isTmpServerPropsFile(doc.fileName)) {
            let rspId: string;
            let serverId: string;
            for (rspId of this.RSPServerProperties.keys()) {
                const docInfo = this.RSPServerProperties.get(rspId).find(prop =>
                    prop.file.toLowerCase() === doc.uri.fsPath.toLowerCase());
                if (docInfo) {
                    serverId = docInfo.server;
                    break;
                }
            }

            if (!serverId) {
                return Promise.reject('Unable to save server properties - server id is invalid');
            }
            const serverHandle: Protocol.ServerHandle = this.explorer.getServerStateById(rspId, serverId).server;
            if (!serverHandle) {
                return Promise.reject('Unable to save server properties - server is invalid');
            }
            return this.explorer.saveServerProperties(rspId, serverHandle, doc.getText()).then(
                updateStatus => {return this.postSaveEditor(rspId, serverHandle, updateStatus, true);},
                updateStatus => {return this.postSaveEditor(rspId, serverHandle, updateStatus, false);}
            );
        }
    }

    public async postSaveEditor(rspId: string, serverHandle: Protocol.ServerHandle, updateStatus: any, success: boolean): Promise<Protocol.Status> {
        const file: string = this.RSPServerProperties.get(rspId).find(prop => prop.server === serverHandle.id).file;

        if(success) {
            this.saveAndShowEditor(file, updateStatus.serverJson.serverJson);
            vscode.window.showInformationMessage(`Server ${serverHandle.id} correctly saved`);
            return updateStatus.validation.status;
        }

        const check: string = typeof updateStatus;
        if(check !== 'object') {
            return Promise.reject(updateStatus);
        }

        this.saveAndShowEditor(file, updateStatus.serverJson.serverJson);
        await vscode.workspace.openTextDocument(file).then(doc =>
            vscode.window.showTextDocument(doc)
        );

        const msg = updateStatus.validation.status.message.concat('\n', updateStatus.validation.status.trace);
        return Promise.reject(msg);
    }

    public async onDidCloseTextDocument(doc: vscode.TextDocument): Promise<void> {
        if (!doc) {
            return Promise.reject('Error closing document - document is invalid');
        }
        if (await this.isTmpServerPropsFile(doc.fileName)) {
            fs.unlink(doc.uri.fsPath, error => {
                console.log(error);
            });
        }
    }

    private isTmpServerPropsFile(docName: string): boolean {
        return docName.indexOf(`${this.PREFIX_TMP}`) > -1;
    }
}
