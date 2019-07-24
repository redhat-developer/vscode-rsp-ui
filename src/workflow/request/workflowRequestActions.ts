import { ServerStateNode } from '../../serverExplorer';
import { window } from 'vscode';

export class ShowInBrowserAction {
    public static async getData(context: ServerStateNode): Promise<{ [index: string]: any }> {
        const deployables: string[] = [];
        deployables.push('Welcome Page (Index)');
        if (!context.deployableStates ||
            context.deployableStates.length > 0) {
            deployables.push(...context.deployableStates.map(deployable => deployable.reference.label));
        }

        const deployment = await window.showQuickPick(deployables,
                                        { placeHolder: 'Which deployment do you want to show in the web browser?' });
        if (!deployment) return;

        return {
            'ShowInBrowserActionHandler.selection.id': deployment
        };
    }
}
