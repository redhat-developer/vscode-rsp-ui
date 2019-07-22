import { Protocol } from 'rsp-client';
import { WorkflowStrategy } from './workflowStrategy';
import { WorkflowStrategyBrowser } from './workflowStrategyBrowser';
import { WorkflowStrategyEditor } from './workflowStrategyEditor';
import { WorkflowStrategyPromptSmall } from './workflowStrategyPromptSmall';

export class WorkflowStrategyManager {
    private strategies: WorkflowStrategy[] = [];

    public constructor() {
        this.strategies.push({
            name: 'workflow.browser.open',
            handler: new WorkflowStrategyBrowser().doAction
        });
        this.strategies.push({
            name: 'workflow.prompt.small',
            handler: new WorkflowStrategyPromptSmall().doAction
        });
        this.strategies.push({
            name: 'workflow.prompt.large',
            handler: new WorkflowStrategyEditor().doAction
        });
        this.strategies.push({
            name: 'workflow.editor.open',
            handler: new WorkflowStrategyEditor().doAction
        });
    }

    public getStrategy(name: string = 'workflow.prompt.small') {
        return this.strategies.find(strategy => strategy.name === name);
    }
}
