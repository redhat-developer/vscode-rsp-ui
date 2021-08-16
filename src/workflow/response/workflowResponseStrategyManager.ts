import { WorkflowResponseStrategyBrowser } from './workflowResponseStrategyBrowser';
import { WorkflowResponseStrategyEditor } from './workflowResponseStrategyEditor';
import { WorkflowResponseStrategyPromptSmall } from './workflowResponseStrategyPromptSmall';
import { WorkflowResponseStrategyTerminal } from './workflowResponseStrategyTerminal';

export interface WorkflowResponseStrategy {
    name: string;
    handler: any;
}

export class WorkflowResponseStrategyManager {
    private strategies: WorkflowResponseStrategy[] = [];

    public constructor() {
        this.strategies.push({
            name: 'workflow.browser.open',
            handler: WorkflowResponseStrategyBrowser.doAction
        });
        this.strategies.push({
            name: 'workflow.prompt.small',
            handler: WorkflowResponseStrategyPromptSmall.doAction
        });
        this.strategies.push({
            name: 'workflow.prompt.large',
            handler: WorkflowResponseStrategyEditor.doAction
        });
        this.strategies.push({
            name: 'workflow.editor.open',
            handler: WorkflowResponseStrategyEditor.doAction
        });
        this.strategies.push({
            name: 'workflow.terminal.open',
            handler: WorkflowResponseStrategyTerminal.doAction
        });
    }

    public getStrategy(name = 'workflow.prompt.small') {
        return this.strategies.find(strategy => strategy.name === name);
    }
}
