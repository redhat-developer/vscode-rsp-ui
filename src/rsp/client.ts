import { JobProgress } from '../jobprogress';
import { RSPClient } from 'rsp-client';
import * as vscode from 'vscode';
import { ServerInfo } from 'vscode-server-connector-api';

const PROTOCOL_VERSION = '0.23.0';

export async function initClient(serverInfo: ServerInfo): Promise<RSPClient> {
    const client = new RSPClient('localhost', serverInfo.port);
    await client.connect();
    client.getIncomingHandler().onPromptString(event => {
        return new Promise<string>((resolve, reject) => {
            vscode.window.showInputBox({ prompt: event.prompt, password: true })
                .then(value => {
                    if (value && value.trim().length) {
                        resolve(value);
                    } else {
                        reject(new Error('Cancelled by user'));
                    }
                });
        });
    });
    client.getIncomingHandler().onMessageBox(event => {
        return new Promise<string>((resolve, reject) => {
            if( event.severity === 1 ) {
                // info
                vscode.window.showInformationMessage(event.message);
            } else if( event.severity === 2 ) {
                // warning
                vscode.window.showWarningMessage(event.message);
            } else if( event.severity === 4 ) {
                // error
                vscode.window.showErrorMessage(event.message);
            }
        })
    });

    client.getOutgoingHandler().registerClientCapabilities({ 
            map: { 
                'protocol.version': PROTOCOL_VERSION, 
                'prompt.string': 'true',
                'messagebox': 'true',
            } 
        });
    JobProgress.create(client);

    return client;
}
