/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { Utils } from '../../src/utils/utils';
import * as vscode from 'vscode';
import { RSPController } from 'vscode-server-connector-api';
import { Protocol } from 'rsp-client';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('Utils', () => {
    let sandbox: sinon.SinonSandbox;

    const rspController: RSPController = {
        getHost: () => 'localhost',
        getPort: () => 8080,
        getImage: () => vscode.Uri.parse('fake.png'),
        onRSPServerStateChanged: undefined,
        startRSP: undefined,
        stopRSP: undefined
    };

    const fakeExtension: vscode.Extension<RSPController> = {
        activate: () => Promise.resolve(rspController),
        exports: undefined,
        extensionPath: undefined,
        id: 'fakeId',
        isActive: true,
        packageJSON: undefined,
        extensionKind: undefined,
        extensionUri: undefined
    };

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('activateExternalProvider', () => {

        test('return error message if no extension found', async () => {
            sandbox.stub(vscode.extensions, 'getExtension').resolves(undefined);
            try {
                await Utils.activateExternalProvider('fakeId');
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to retrieve fakeId extension');
            }
        });

        test('check activate method is called after getExtension', async () => {
            const getExtensionStub = sandbox.stub(vscode.extensions, 'getExtension').resolves(fakeExtension);
            const activateStub = sandbox.stub(fakeExtension, 'activate').resolves(rspController);
            await Utils.activateExternalProvider('fakeId');
            expect(getExtensionStub).calledBefore(activateStub);
        });

        test('return error if no rspProvider found when activating external extension', async () => {
            const fakeExtension: vscode.Extension<RSPController> = {
                activate: () => undefined,
                exports: undefined,
                extensionPath: undefined,
                id: 'fakeId',
                isActive: true,
                packageJSON: undefined,
                extensionKind: undefined,
                extensionUri: undefined
            };

            sandbox.stub(vscode.extensions, 'getExtension').resolves(fakeExtension);
            try {
                await Utils.activateExternalProvider('fakeId');
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to activate fakeId extension');
            }
        });

    });

    suite('getIcon', () => {

        test('return null is rspId is not valid', async () => {
            const result = await Utils.getIcon('', '');
            expect(result).equals(null);
        });

        test('check that activateExternalProvider is called with correct id', async () => {
            const activateExternalProviderStub = sandbox.stub(Utils, 'activateExternalProvider').resolves(rspController);
            await Utils.getIcon('fakeId', 'fakeType');
            expect(activateExternalProviderStub).calledOnceWith('fakeId');
        });

        test('check if showErrorMessage method is called if activateExternalProvider fails', async () => {
            const error = new Error('Failed to retrieve fakeId extension');
            sandbox.stub(Utils, 'activateExternalProvider').rejects(error);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            try {
                await Utils.getIcon('fakeId', 'fakeType');
            } finally {
                expect(showErrorStub).calledOnceWith(error);
            }
        });

        test('check if getImage method is called if extension is activated correctly', async () => {
            const getImageStub = sandbox.stub(rspController, 'getImage');
            sandbox.stub(Utils, 'activateExternalProvider').resolves(rspController);
            await Utils.getIcon('fakeId', 'fakeType');
            expect(getImageStub).calledOnceWith('fakeType');
        });
    });

    suite('promptUser', () => {

        const responseItem: Protocol.WorkflowResponseItem = {
            content: 'text',
            id: 'id',
            itemType: 'type',
            label: 'label',
            prompt: null,
            properties: null
        };

        let quickPickStub: sinon.SinonStub;

        setup(() => {
            quickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
        });

        test('check if prompt value contains the correct message when item passed has both label and content properties set', async () => {
            const quickPickItem = vscode.window.createQuickPick();
            const createPickStub = sandbox.stub(vscode.window, 'createQuickPick').returns(quickPickItem);
            setInterval(() => {
                quickPickItem.hide();
            }, 20);
            await Utils.promptUser(responseItem, {});
            expect(createPickStub).calledOnce;
            expect(quickPickItem.value).equals('labeltext');
            expect(quickPickItem.items).deep.equals([{label: 'Continue...', alwaysShow: true, picked: true}]);
        });

        test('check if prompt placeholder contains correct message if item doesnt have content prop set', async () => {
            const quickPickItem = vscode.window.createQuickPick();
            const createPickStub = sandbox.stub(vscode.window, 'createQuickPick').returns(quickPickItem);
            setInterval(() => {
                quickPickItem.hide();
            }, 20);
            const responseItemNoContent: Protocol.WorkflowResponseItem = {
                ...responseItem,
                content: ''
            };
            await Utils.promptUser(responseItemNoContent, {});
            expect(createPickStub).calledOnce;
            expect(quickPickItem.value).equals('label');
            expect(quickPickItem.items).deep.equals([{label: 'Continue...', alwaysShow: true, picked: true}]);
        });

        test('check if value returned is true if no showQuickPick item is selected', async () => {
            const quickPickItem = vscode.window.createQuickPick();
            sandbox.stub(vscode.window, 'createQuickPick').returns(quickPickItem);
            setInterval(() => {
                quickPickItem.hide();
            }, 20);
            const result = await Utils.promptUser(responseItem, {});
            expect(result).equals(true);
        });

        /*test('check if value returned is false if a showQuickPick item is selected', async () => {
            const quickPickItem = vscode.window.createQuickPick();
            sandbox.stub(vscode.window, 'createQuickPick').returns(quickPickItem);
            setInterval(() => {
                quickPickItem.selectedItems = [{label: 'Continuee...', alwaysShow: true, picked: true}];
            }, 50);
            const result = await Utils.promptUser(responseItem, {});
            expect(result).equals(false);
        });*/

        test('check if showQuickPick is called with correct params when responseType is boolean', async () => {
            const prompt = 'label\ntext';
            const responseItemBool: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'bool',
                    validResponses: null
                }
            };
            await Utils.promptUser(responseItemBool, {});

            expect(quickPickStub).calledOnceWith(['Yes (True)', 'No (False)'], { placeHolder: prompt, ignoreFocusOut: true });
        });

        test('check if showQuickPick is called with correct params when responseType is neither bool nor none and there are validResponses', async () => {
            const responseItemString: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'string',
                    validResponses: ['text', 'text2']
                }
            };
            await Utils.promptUser(responseItemString, {});

            expect(quickPickStub).calledOnceWith(['text', 'text2'], { placeHolder: 'label', ignoreFocusOut: true });
        });

        test('check if showQuickPick is not called but the showInputox is called if responseItem is neither bool nor none and there are no validResponses', async () => {
            const prompt = 'label\ntext';
            const responseItemString: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'string',
                    validResponses: null
                }
            };
            const showInputStub = sandbox.stub(vscode.window, 'showInputBox').resolves('input');
            await Utils.promptUser(responseItemString, {});

            expect(quickPickStub).not.called;
            expect(showInputStub).calledOnceWith({ prompt: prompt, ignoreFocusOut: true, password: false });
        });

        test('check if workflowMap is filled correctly if responeType is bool', async () => {
            const workflowMap = {};
            const responseItemBool: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'bool',
                    validResponses: null
                }
            };
            quickPickStub.resolves('Yes (True)');
            const result = await Utils.promptUser(responseItemBool, workflowMap);
            expect(result).equals(false);
            expect(workflowMap['id']).equals(true);
        });

        test('check if workflowMap is filled correctly if responeType is neither bool not none and validResponse field is filled', async () => {
            const workflowMap = {};
            const responseItemString: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'string',
                    validResponses: ['text', 'text2']
                }
            };
            quickPickStub.resolves('text2');
            const result = await Utils.promptUser(responseItemString, workflowMap);
            expect(result).equals(false);
            expect(workflowMap['id']).equals('text2');
        });

        test('check if workflowMap is filled correctly if responeType is int', async () => {
            const workflowMap = {};
            const responseItemInt: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'int',
                    validResponses: null
                }
            };
            sandbox.stub(vscode.window, 'showInputBox').resolves('1');
            const result = await Utils.promptUser(responseItemInt, workflowMap);
            expect(result).equals(false);
            expect(workflowMap['id']).equals(+1);
        });

        test('check if workflowMap is filled correctly if responeType is string but there are no validResponses', async () => {
            const workflowMap = {};
            const responseItemInt: Protocol.WorkflowResponseItem = {
                ...responseItem,
                prompt: {
                    responseSecret: false,
                    responseType: 'string',
                    validResponses: null
                }
            };
            sandbox.stub(vscode.window, 'showInputBox').resolves('text');
            const result = await Utils.promptUser(responseItemInt, workflowMap);
            expect(result).equals(false);
            expect(workflowMap['id']).equals('text');
        });

    });

});
