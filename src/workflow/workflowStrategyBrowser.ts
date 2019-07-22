import { Protocol } from 'rsp-client';
import * as vscode from 'vscode';

export class WorkflowStrategyBrowser {
    public async doAction(item: Protocol.WorkflowResponseItem): Promise<boolean> {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(item.content));
        return false;
    }
}
