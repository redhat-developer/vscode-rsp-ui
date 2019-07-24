import { Protocol } from 'rsp-client';
import { ServerStateNode } from '../../serverExplorer';
import { ShowInBrowserAction } from './workflowRequestActions';

export class WorkflowRequestFactory {

    private static actionsAvailable: Map<string, any> = new Map<string, any>()
        .set('ShowInBrowserActionHandler.actionId', ShowInBrowserAction);

    public static async createWorkflowRequest(action: string, context: ServerStateNode): Promise<Protocol.ServerActionRequest> {
        if (!context) {
            return Promise.reject(`Unable to create request for action ${action} - context is undefined`);
        }

        const data = await WorkflowRequestFactory.getData(action, context);
        if (data === undefined) {
            return;
        }

        const actionRequest: Protocol.ServerActionRequest = {
            actionId: action,
            data: data,
            requestId: null,
            serverId: context.server.id
        };

        return actionRequest;
    }

    private static async getData(action: string, context: ServerStateNode): Promise<{ [index: string]: any }> {
        if (!WorkflowRequestFactory.actionsAvailable.has(action)) {
            return null;
        }

        return WorkflowRequestFactory.actionsAvailable.get(action).getData(context);
    }
}
