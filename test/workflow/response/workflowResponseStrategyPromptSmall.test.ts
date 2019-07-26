/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import { Protocol } from 'rsp-client';
import { ServerEditorAdapter } from '../../../src/serverEditorAdapter';
import { ServerExplorer } from '../../../src/serverExplorer';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { Utils } from '../../../src/utils/utils';
import { WorkflowResponseStrategyPromptSmall } from '../../../src/workflow/response/workflowResponseStrategyPromptSmall';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('WorkflowResponseStrategyPromptSmall', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('doAction', () => {
        const item: Protocol.WorkflowResponseItem = {
            content: 'test\ntest',
            id: 'id',
            itemType: 'workflow.prompt.small',
            label: 'label',
            prompt: null,
            properties: null
        };

        test('return true if no item is passed as param', async () => {
            const result = await WorkflowResponseStrategyPromptSmall.doAction(undefined);
            expect(result).equals(true);
        });

        test('getInstance explorer if a valid item is passed to method', async () => {
            const instanceStub = sandbox.stub(ServerExplorer, 'getInstance');
            await WorkflowResponseStrategyPromptSmall.doAction(item);
            expect(instanceStub).calledOnce;
        });

        test('check if isMultilineText is called with right params', async () => {
            const multilineStub = sandbox.stub(Utils, 'isMultilineText').returns(true);
            await WorkflowResponseStrategyPromptSmall.doAction(item);
            expect(multilineStub).calledOnceWith('test\ntest');
        });

        test('check if showEditor is called if content is multiline', async () => {
            const explorer = ServerExplorer.getInstance();
            const editorStub = sandbox.stub(ServerEditorAdapter.getInstance(explorer), 'showEditor').resolves();
            await WorkflowResponseStrategyPromptSmall.doAction(item);
            expect(editorStub).calledOnceWith('id', 'test\ntest');
        });

        test('check if return true if showEditor fails', async () => {
            const explorer = ServerExplorer.getInstance();
            sandbox.stub(ServerEditorAdapter.getInstance(explorer), 'showEditor').rejects();
            const result = await WorkflowResponseStrategyPromptSmall.doAction(item);
            expect(result).equals(true);
        });

        test('check if promptUser is called if isMultilineText method returns false', async () => {
            item.content = 'test';
            sandbox.stub(Utils, 'isMultilineText').returns(false);
            const promptUserStub = sandbox.stub(Utils, 'promptUser').resolves(false);
            await WorkflowResponseStrategyPromptSmall.doAction(item, {});
            expect(promptUserStub).calledOnceWith(item, {});
        });

        test('check if return true if promptUser returns true', async () => {
            item.content = 'test';
            sandbox.stub(Utils, 'isMultilineText').returns(false);
            sandbox.stub(Utils, 'promptUser').resolves(true);
            const result = await WorkflowResponseStrategyPromptSmall.doAction(item, {});
            expect(result).equals(true);
        });

        test('return false if no error occurs', async () => {
            item.content = 'test';
            sandbox.stub(Utils, 'isMultilineText').returns(false);
            sandbox.stub(Utils, 'promptUser').resolves(false);
            const result = await WorkflowResponseStrategyPromptSmall.doAction(item, {});
            expect(result).equals(false);
        });

    });

});
