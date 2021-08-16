import { Protocol } from 'rsp-client';
import { ServerEditorAdapter } from '../../serverEditorAdapter';
import { ServerExplorer } from '../../serverExplorer';

export class WorkflowResponseStrategyEditor {
    public static async doAction(item: Protocol.WorkflowResponseItem): Promise<boolean> {
        if (!item) {
            return true;
        }
        let canceled = false;
        let path: string;
        let content: string = item.content;
        const explorer = ServerExplorer.getInstance();

        if (item.properties && 'workflow.editor.file.path' in item.properties) {
            path = item.properties['workflow.editor.file.path'];
        }

        if (item.properties && 'workflow.editor.file.content' in item.properties) {
            content = item.properties['workflow.editor.file.content'];
        }

        await ServerEditorAdapter.getInstance(explorer).showEditor(item.id, content, path)
            .catch(() => canceled = true);
        return canceled;
    }
}
