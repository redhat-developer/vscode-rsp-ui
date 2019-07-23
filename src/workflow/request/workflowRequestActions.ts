import { ServerStateNode } from '../../serverExplorer';

export class ShowInBrowserAction {
    public static getData(context: ServerStateNode): { [index: string]: any } {
        return {
            'ShowInBrowserActionHandler.selection.id': context.deployableStates[0].reference.label
        };
    }
}
