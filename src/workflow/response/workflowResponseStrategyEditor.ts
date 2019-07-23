import { Protocol } from 'rsp-client';
import { ServerEditorAdapter } from '../../serverEditorAdapter';
import { ServerExplorer } from '../../serverExplorer';

export class WorkflowResponseStrategyEditor {
    public async doAction(item: Protocol.WorkflowResponseItem): Promise<boolean> {
        const explorer = ServerExplorer.getInstance();
        let canceled = false;
        await ServerEditorAdapter.getInstance(explorer).showEditor(item.id, item.content)
                .catch(() => canceled = true);
        return canceled;
    }
}
