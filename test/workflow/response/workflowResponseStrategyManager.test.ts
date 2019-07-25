/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { WorkflowResponseStrategyBrowser } from '../../../src/workflow/response/workflowResponseStrategyBrowser';
import { WorkflowResponseStrategyManager } from '../../../src/workflow/response/workflowResponseStrategyManager';
import { WorkflowResponseStrategyPromptSmall } from '../../../src/workflow/response/workflowResponseStrategyPromptSmall';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('WorkflowResponseStrategyManager', () => {
    let sandbox: sinon.SinonSandbox;
    let manager: WorkflowResponseStrategyManager;

    setup(() => {
        sandbox = sinon.createSandbox();
        manager = new WorkflowResponseStrategyManager();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('check if strategies array contains all available strategies when new Manager is created', async () => {
        const strategies = Reflect.get(manager, 'strategies');
        expect(strategies.length).equals(4);
    });

    test('check if getStrategy returns right strategy if name is undefined', async () => {
        const expected = {
            name: 'workflow.prompt.small',
            handler: WorkflowResponseStrategyPromptSmall.doAction
        };
        const result = manager.getStrategy(undefined);
        expect(result).deep.equals(expected);
    });

    test('check if getStrategy returns right strategy if name is defined', async () => {
        const expected = {
            name: 'workflow.browser.open',
            handler: WorkflowResponseStrategyBrowser.doAction
        };
        const result = manager.getStrategy('workflow.browser.open');
        expect(result).deep.equals(expected);
    });

});
