/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import { Protocol, RSPClient } from 'rsp-client';
import * as vscode from 'vscode';
import { window } from 'vscode';
import { myContext } from '../extension';


export const GLOBAL_STATE_SERVER_DEBUG_PROJECT_NAME_PREFIX = 'rsp-ui.server.debug.projectName';
export class JavaDebugSession {

    private port: string;

    private processOutputListener: { port: string, server: Protocol.ServerHandle, listener: ((output: Protocol.ServerProcessOutput) => void)};

    public start(server: Protocol.ServerHandle, port: string, client: RSPClient) {
        this.processOutputListener = {
            port,
            server,
            listener: output => {
                if (output
                    && output.server
                    && output.server.id === server.id
                    && output.text
                    && output.text.includes('Listening for transport dt_socket')) {
                    this.startDebugger(port, server.id);
                    client.getIncomingHandler().removeOnServerProcessOutputAppended(this.processOutputListener.listener);
                }
            }
        };
        client.getIncomingHandler().onServerProcessOutputAppended(this.processOutputListener.listener);
    }

    private async discoverProjectName(serverId: string): Promise<string | undefined> {
        const key = GLOBAL_STATE_SERVER_DEBUG_PROJECT_NAME_PREFIX + '/' + serverId;
        const currVal: string | undefined = myContext && myContext.globalState ? myContext.globalState.get(key) : undefined;
        const val = await window.showInputBox({prompt: 'Please input a project name to be used by the java debugger.',
            value: currVal || '', ignoreFocusOut: true});
        if(val !== currVal) {
            if(myContext && myContext.globalState)
                myContext.globalState.update(key, val);
        }
        return val;
    }

    private async startDebugger(port: string, serverId: string) {
        this.port = port;
        const pName: string | undefined = await this.discoverProjectName(serverId);
        const props = {
            type: 'java',
            request: 'attach',
            name: 'Debug (Remote)',
            hostName: 'localhost',
            port,
            projectName: pName,
        };
        const props2 = pName ? {...props, projectName: pName} : props;
        vscode.debug.startDebugging(undefined, props2);
    }

    public isDebuggerStarted(): boolean {
        return this.port !== undefined;
    }

    public async stop() {
        await vscode.commands.executeCommand('workbench.action.debug.stop');
        this.port = undefined;
    }
}
