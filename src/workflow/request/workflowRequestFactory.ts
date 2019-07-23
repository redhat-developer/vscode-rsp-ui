import { Protocol } from 'rsp-client';
import { ServerStateNode } from '../../serverExplorer';
import { ShowInBrowserAction } from './workflowRequestActions';

export class WorkflowRequestFactory {

    private static actionsAvailable: Map<string, any> = new Map<string, any>()
        .set('ShowInBrowserActionHandler.actionId', ShowInBrowserAction);

    public static createWorkflowRequest(action: string, context: ServerStateNode): Protocol.ServerActionRequest {
        const actionRequest: Protocol.ServerActionRequest = {
            actionId: action,
            data: WorkflowRequestFactory.getData(action, context),
            requestId: null,
            serverId: context.server.id
        };

        return actionRequest;
    }

    private static getData(action: string, context: ServerStateNode): { [index: string]: any } {
        if (!WorkflowRequestFactory.actionsAvailable.has(action)) {
            return null;
        }

        return WorkflowRequestFactory.actionsAvailable.get(action).getData(context);
    }
}
