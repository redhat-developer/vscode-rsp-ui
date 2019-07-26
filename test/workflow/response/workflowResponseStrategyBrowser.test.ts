/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import { Protocol } from 'rsp-client';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { commands, Uri } from 'vscode';
import { WorkflowResponseStrategyBrowser } from '../../../src/workflow/response/workflowResponseStrategyBrowser';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('WorkflowResponseStrategyBrowser', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('doAction', () => {
        const item: Protocol.WorkflowResponseItem = {
            content: 'path',
            id: 'id',
            itemType: 'workflow.prompt.small',
            label: 'label',
            prompt: null,
            properties: null
        };

        test('return true if no item is passed as param', async () => {
            const result = await WorkflowResponseStrategyBrowser.doAction(undefined);
            expect(result).equals(true);
        });

        test('executeCommand is called with right param if an item is passed to method', async () => {
            const executeStub = sandbox.stub(commands, 'executeCommand');
            await WorkflowResponseStrategyBrowser.doAction(item);
            expect(executeStub).calledOnceWith('vscode.open', Uri.parse(item.content));
        });

        test('return false if item if method is called with valid item', async () => {
            const result = await WorkflowResponseStrategyBrowser.doAction(item);
            expect(result).equals(false);
        });

    });

});
