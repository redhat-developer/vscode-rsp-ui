import { WorkflowResponseStrategyBrowser } from './workflowResponseStrategyBrowser';
import { WorkflowResponseStrategyEditor } from './workflowResponseStrategyEditor';
import { WorkflowResponseStrategyPromptSmall } from './workflowResponseStrategyPromptSmall';

export interface WorkflowResponseStrategy {
    name: string;
    handler: any;
}

export class WorkflowResponseStrategyManager {
    private strategies: WorkflowResponseStrategy[] = [];

    public constructor() {
        this.strategies.push({
            name: 'workflow.browser.open',
            handler: new WorkflowResponseStrategyBrowser().doAction
        });
        this.strategies.push({
            name: 'workflow.prompt.small',
            handler: new WorkflowResponseStrategyPromptSmall().doAction
        });
        this.strategies.push({
            name: 'workflow.prompt.large',
            handler: new WorkflowResponseStrategyEditor().doAction
        });
        this.strategies.push({
            name: 'workflow.editor.open',
            handler: new WorkflowResponseStrategyEditor().doAction
        });
    }

    public getStrategy(name: string = 'workflow.prompt.small') {
        return this.strategies.find(strategy => strategy.name === name);
    }
}
