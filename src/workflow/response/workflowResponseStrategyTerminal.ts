import { Protocol } from 'rsp-client';
import * as vscode from 'vscode';

export class WorkflowResponseStrategyTerminal {
    public static async doAction(item: Protocol.WorkflowResponseItem): Promise<boolean> {
        if (!item) {
            return true;
        }

        if (item.properties && 'workflow.terminal.cmd' in item.properties) {
            const terminal = vscode.window.createTerminal(item.id);
            terminal.show();
            terminal.sendText(item.properties['workflow.terminal.cmd']);
        }
        return false;
    }
}
