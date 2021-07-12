/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';
import { CommandHandler } from './extensionApi';
import { ServerState } from 'rsp-client';
import { getAPI } from './api/implementation/rspProviderAPI';
import { ServerEditorAdapter } from './serverEditorAdapter';
import { ServerExplorer } from './serverExplorer';
import * as vscode from 'vscode';
import { RSPModel } from 'vscode-server-connector-api';
import { initializeTelemetry, sendTelemetry}  from './telemetry';

let serversExplorer: ServerExplorer;
let commandHandler: CommandHandler;
export let myContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext): Promise<RSPModel> {
    await initializeTelemetry(context);
    serversExplorer = ServerExplorer.getInstance();
    commandHandler = new CommandHandler(serversExplorer);
    myContext = context;
    await registerCommands(commandHandler, context);
    return getAPI();
}

async function registerCommands(commandHandler: CommandHandler, context: vscode.ExtensionContext) {
    const newLocal = [
        vscode.commands.registerCommand('server.startRSP', context => executeCommand(
            commandHandler.startRSP, commandHandler, context, 'Unable to start the server: ')),
        vscode.commands.registerCommand('server.disconnectRSP', context => executeCommand(
            commandHandler.disconnectRSP, commandHandler, context, 'Unable to disconnect the server: ')),
        vscode.commands.registerCommand('server.stopRSP', context => executeCommand(
            commandHandler.stopRSP, commandHandler, false, context, 'Unable to stop the server: ')),
        vscode.commands.registerCommand('server.terminateRSP', context => executeCommand(
            commandHandler.stopRSP, commandHandler, true, context, 'Unable to start the server: ')),
        vscode.commands.registerCommand('server.start', context => executeCommand(
            commandHandler.startServer, commandHandler, 'run', context, 'Unable to start the server: ')),
        vscode.commands.registerCommand('server.restart', context => executeCommand(
            commandHandler.restartServer, commandHandler, 'run', context, 'Unable to restart in run mode the server: ')),
        vscode.commands.registerCommand('server.debug', context => executeCommand(
            commandHandler.debugServer, commandHandler, context, 'Unable to debug the server: ')),
        vscode.commands.registerCommand('server.restartDebug', context => executeCommand(
            commandHandler.restartServer, commandHandler, 'debug', context, 'Unable to restart in debug mode the server: ')),
        vscode.commands.registerCommand('server.stop', context => executeCommand(
            commandHandler.stopServer, commandHandler, false, context, 'Unable to stop the server: ')),
        vscode.commands.registerCommand('server.terminate', context => executeCommand(
            commandHandler.stopServer, commandHandler, true, context, 'Unable to terminate the server: ')),
        vscode.commands.registerCommand('server.remove', context => executeCommand(
            commandHandler.removeServer, commandHandler, context, 'Unable to remove the server: ')),
        vscode.commands.registerCommand('server.output', context => executeCommand(
            commandHandler.showServerOutput, commandHandler, context, 'Unable to show server output channel')),
        vscode.commands.registerCommand('server.addDeployment', context => executeCommand(
            commandHandler.addDeployment, commandHandler, context, 'Unable to add deployment to the server: ')),
        vscode.commands.registerCommand('server.removeDeployment', context => executeCommand(
            commandHandler.removeDeployment, commandHandler, context, 'Unable to remove deployment from the server: ')),
        vscode.commands.registerCommand('server.publishFull', context => executeCommand(
            commandHandler.publishServer, commandHandler, ServerState.PUBLISH_FULL, context, 'Unable to publish (Full) to the server: ')),
        vscode.commands.registerCommand('server.publishIncremental', context => executeCommand(
            commandHandler.publishServer, commandHandler, ServerState.PUBLISH_INCREMENTAL, context, 'Unable to publish (Incremental) to the server: ')),
        vscode.commands.registerCommand('server.editServer', context => executeCommand(
                commandHandler.editServer, commandHandler, context, 'Unable to edit server properties')),
        vscode.commands.registerCommand('server.actions', context => executeCommand(
                commandHandler.serverActions, commandHandler, context, 'Unable to execute action')),
        vscode.commands.registerCommand('server.saveSelectedNode', context => executeCommandAndLog('server.saveSelectedNode',
                commandHandler.saveSelectedNode, commandHandler, context)),
        vscode.commands.registerCommand('server.application.run', context => executeCommand(
                commandHandler.runOnServer, commandHandler, context, 'run', 'Unable to deploy and run application')),
        vscode.commands.registerCommand('server.application.debug', context => executeCommand(
                commandHandler.runOnServer, commandHandler, context, 'debug', 'Unable to deploy and debug application')),

        vscode.commands.registerCommand('server.createServer', context => executeCommandAndLog('server.createServer',
            commandHandler.createServer, commandHandler, context, 'Unable to create the server: ')),

        // Do these two still exist? Can't seem to get them to show up
        vscode.commands.registerCommand('server.addLocation', context => executeCommandAndLog('server.addLocation',
            commandHandler.addLocation, commandHandler, context, 'Unable to detect any server: ')),
        vscode.commands.registerCommand('server.downloadRuntime', context => executeCommandAndLog('server.downloadRuntime',
            commandHandler.downloadRuntime, commandHandler, context, 'Unable to detect any runtime: ')),
        vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
        vscode.workspace.onDidCloseTextDocument(onDidCloseTextDocument)
    ];
    const subscriptions = newLocal;
    subscriptions.forEach(element => {  context.subscriptions.push(element); }, this);

    return sendTelemetry('activation');
}

export function deactivate() {
    for (const rspProvider of serversExplorer.RSPServersStatus.values()) {
        if (rspProvider.client) {
            if( rspProvider.info.spawned) {
                rspProvider.client.shutdownServer();
            } else {
                rspProvider.client.disconnect();
            }
        }
    }
}

function onDidSaveTextDocument(doc: vscode.TextDocument) {
    ServerEditorAdapter.getInstance(serversExplorer).onDidSaveTextDocument(doc).catch(err => {
        vscode.window.showErrorMessage(err);
    });
}

function onDidCloseTextDocument(doc: vscode.TextDocument) {
    ServerEditorAdapter.getInstance(serversExplorer).onDidCloseTextDocument(doc);
}

export function executeCommandAndLog(name: String, command: (...args: any[]) => Promise<any>, thisArg: any, ...params: any[]) {
    let telemetryProps: any = {
        identifier: name,
    };
    const startTime = Date.now();
    const commandErrorLabel = typeof params[params.length - 1] === 'string' ? params[params.length - 1] : '';
    try {
        return command.call(thisArg, ...params).catch((err: string | Error) => {
            telemetryProps.error = err.toString();
            const error = typeof err === 'string' ? new Error(err) : err;
            const msg = error.hasOwnProperty('message') ? error.message : '';
            if (commandErrorLabel === '' && msg === '') {
                return;
            }
            vscode.window.showErrorMessage(`${commandErrorLabel} Extension backend error - ${msg.toLowerCase()}`);
        });
    } finally {
        telemetryProps.duration = Date.now() - startTime;
        sendTelemetry('command', telemetryProps);
    }
}


export function executeCommand(command: (...args: any[]) => Promise<any>, thisArg: any, ...params: any[]) {
    const commandErrorLabel = typeof params[params.length - 1] === 'string' ? params[params.length - 1] : '';
    return command.call(thisArg, ...params).catch((err: string | Error) => {
        const error = typeof err === 'string' ? new Error(err) : err;
        const msg = error.hasOwnProperty('message') ? error.message : '';
        if (commandErrorLabel === '' && msg === '') {
            return;
        }
        vscode.window.showErrorMessage(`${commandErrorLabel} Extension backend error - ${msg.toLowerCase()}`);
    });
}
