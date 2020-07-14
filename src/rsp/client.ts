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

    client.getOutgoingHandler().registerClientCapabilities(
        { map: { 'protocol.version': PROTOCOL_VERSION, 'prompt.string': 'true' } });
    JobProgress.create(client);

    return client;
}
