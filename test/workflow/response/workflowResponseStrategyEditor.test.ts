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
import { WorkflowResponseStrategyEditor } from '../../../src/workflow/response/workflowResponseStrategyEditor';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('WorkflowResponseStrategyEditor', () => {
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
            const result = await WorkflowResponseStrategyEditor.doAction(undefined);
            expect(result).equals(true);
        });

        test('getInstance explorer if a valid item is passed to method', async () => {
            const instanceStub = sandbox.stub(ServerExplorer, 'getInstance');
            await WorkflowResponseStrategyEditor.doAction(item);
            expect(instanceStub).calledOnce;
        });

        test('check if showEditor is called with right params', async () => {
            const explorer = ServerExplorer.getInstance();
            const editorStub = sandbox.stub(ServerEditorAdapter.getInstance(explorer), 'showEditor').resolves();
            await WorkflowResponseStrategyEditor.doAction(item);
            expect(editorStub).calledOnceWith('id', 'test\ntest');
        });

        test('check if return true if showEditor fails', async () => {
            const explorer = ServerExplorer.getInstance();
            sandbox.stub(ServerEditorAdapter.getInstance(explorer), 'showEditor').rejects();
            const result = await WorkflowResponseStrategyEditor.doAction(item);
            expect(result).equals(true);
        });

        test('return false if no error occurs', async () => {
            const result = await WorkflowResponseStrategyEditor.doAction(item);
            expect(result).equals(false);
        });

    });

});
