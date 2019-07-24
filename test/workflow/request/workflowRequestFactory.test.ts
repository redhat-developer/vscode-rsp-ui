/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import { ProtocolStubs } from '../../protocolstubs';
import { Protocol } from 'rsp-client';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { ShowInBrowserAction } from '../../../src/workflow/request/workflowRequestActions';
import { WorkflowRequestFactory } from '../../../src/workflow/request/workflowRequestFactory';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('WorkflowRequestFactory', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('createWorkflowRequest', () => {
        test('error if no action is passed when calling method', async () => {
            try {
                await WorkflowRequestFactory.createWorkflowRequest(undefined, ProtocolStubs.unknownServerState);
            } catch (err) {
                expect(err).equals('Unable to create request - action is undefined');
            }
        });

        test('error if no context is passed to method', async () => {
            try {
                await WorkflowRequestFactory.createWorkflowRequest('action', undefined);
            } catch (err) {
                expect(err).equals('Unable to create request for action action - context is undefined');
            }
        });

        test('check if getData method is called with right params', async () => {
            const getDataStub = sandbox.stub(WorkflowRequestFactory, 'getData' as any).resolves(undefined);
            await WorkflowRequestFactory.createWorkflowRequest('action', ProtocolStubs.unknownServerState);
            expect(getDataStub).calledOnceWith('action', ProtocolStubs.unknownServerState);
        });

        test('check if undefined return if getData returns undefined', async () => {
            sandbox.stub(WorkflowRequestFactory, 'getData' as any).resolves(undefined);
            const result = await WorkflowRequestFactory.createWorkflowRequest('action', ProtocolStubs.unknownServerState);
            expect(result).equals(undefined);
        });

        test('check if correct ServerActionRequest is returned if getData returns a value different from undefined', async () => {
            const actionRequest: Protocol.ServerActionRequest = {
                actionId: 'action',
                data: null,
                requestId: null,
                serverId: 'id'
            };
            sandbox.stub(WorkflowRequestFactory, 'getData' as any).resolves(null);
            const result = await WorkflowRequestFactory.createWorkflowRequest('action', ProtocolStubs.unknownServerState);
            expect(result).deep.equals(actionRequest);
        });
    });

    suite('getData', () => {
        let getData;

        setup(() => {
            getData = Reflect.get(WorkflowRequestFactory, 'getData');
        });

        test('return null if action is not in actionsAvailable map', async () => {
            const result = await getData('action', ProtocolStubs.unknownServerState);
            expect(result).equals(null);
        });

        test('get method is called if action exists in actionsAvailable map', async () => {
            const getStubs = sandbox.stub(ShowInBrowserAction, 'getData').resolves(undefined);
            await getData('ShowInBrowserActionHandler.actionId', ProtocolStubs.unknownServerState);
            expect(getStubs).calledOnceWith(ProtocolStubs.unknownServerState);
        });
    });

});
