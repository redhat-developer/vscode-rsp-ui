import { Protocol } from 'rsp-client';
import { ServerEditorAdapter } from '../../serverEditorAdapter';
import { ServerExplorer } from '../../serverExplorer';

export class WorkflowResponseStrategyEditor {
    public static async doAction(item: Protocol.WorkflowResponseItem): Promise<boolean> {
        if (!item) {
            return true;
        }
        let canceled = false;
        const explorer = ServerExplorer.getInstance();
        await ServerEditorAdapter.getInstance(explorer).showEditor(item.id, item.content)
                .catch(() => canceled = true);
        return canceled;
    }
}
