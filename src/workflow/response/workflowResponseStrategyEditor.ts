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

        if (item.properties &&
            item.properties.hasOwnProperty('workflow.editor.file.path')) {
            path = item.properties['workflow.editor.file.path'];
        }

        if (item.properties &&
            item.properties.hasOwnProperty('workflow.editor.file.content')) {
            content = item.properties['workflow.editor.file.content'];
        }

        await ServerEditorAdapter.getInstance(explorer).showEditor(item.id, content, path)
                .catch(() => canceled = true);
        return canceled;
    }
}
