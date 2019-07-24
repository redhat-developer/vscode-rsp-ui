/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import { ProtocolStubs } from '../../protocolstubs';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { window } from 'vscode';
import { ShowInBrowserAction } from '../../../src/workflow/request/workflowRequestActions';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('WorkflowRequestActions', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('ShowInBrowserAction', () => {
        const deployables: string[] = ['Welcome Page (Index)'];

        test('call quickpick with one element if context doesn\'t contain any deployable', async () => {
            const quickPickStub = sandbox.stub(window, 'showQuickPick').resolves(undefined);
            await ShowInBrowserAction.getData(ProtocolStubs.unknownServerState);
            expect(quickPickStub).calledOnceWith(deployables,
                 { placeHolder: 'Which deployment do you want to show in the web browser?' });
        });

        test('call quickpick with correct params if context contains deployables', async () => {
            deployables.push('fake');
            const quickPickStub = sandbox.stub(window, 'showQuickPick').resolves(undefined);
            await ShowInBrowserAction.getData(ProtocolStubs.startedServerState);
            expect(quickPickStub).calledOnceWith(deployables,
                 { placeHolder: 'Which deployment do you want to show in the web browser?' });
        });

        test('getData returns undefined if no deployment is chosen in quickpick', async () => {
            sandbox.stub(window, 'showQuickPick').resolves(undefined);
            const result = await ShowInBrowserAction.getData(ProtocolStubs.unknownServerState);
            expect(result).equals(undefined);
        });

        test('getData returns object if deployment is chosen in quickpick', async () => {
            const dataResult = {
                'ShowInBrowserActionHandler.selection.id': 'Welcome Page (Index)'
            };
            sandbox.stub(window, 'showQuickPick').resolves('Welcome Page (Index)');
            const result = await ShowInBrowserAction.getData(ProtocolStubs.unknownServerState);
            expect(result).deep.equals(dataResult);
        });

    });

});
