import { Protocol } from 'rsp-client';
import * as vscode from 'vscode';

export class WorkflowResponseStrategyBrowser {
    public async doAction(item: Protocol.WorkflowResponseItem): Promise<boolean> {
        if (!item) {
            return true;
        }
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(item.content));
        return false;
    }
}
