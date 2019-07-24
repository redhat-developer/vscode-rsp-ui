import { Protocol } from 'rsp-client';
import { ServerEditorAdapter } from '../../serverEditorAdapter';
import { ServerExplorer } from '../../serverExplorer';
import { Utils } from '../../utils/utils';

export class WorkflowResponseStrategyPromptSmall {
    public async doAction(item: Protocol.WorkflowResponseItem, workflowMap?: { [index: string]: any } ): Promise<boolean> {
        if (!item) {
            return true;
        }
        const explorer = ServerExplorer.getInstance();
        let canceled = false;
        if (Utils.isMultilineText(item.content)) {
            await ServerEditorAdapter.getInstance(explorer).showEditor(item.id, item.content).catch(
                () => canceled = true
            );
        } else {
            canceled = await Utils.promptUser(item, workflowMap);
        }
        return canceled;
    }
}
