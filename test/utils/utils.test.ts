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
        packageJSON: undefined
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
                packageJSON: undefined
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
            const error = 'Failed to retrieve fakeId extension';
            sandbox.stub(Utils, 'activateExternalProvider').rejects(error);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            try {
                await Utils.getIcon('fakeId', 'fakeType');
                expect(showErrorStub).calledOnceWith(error);
            } catch (err) {

            }
        });

        test('check if getImage method is called if extension is activated correctly', async () => {
            const getImageStub = sandbox.stub(rspController, 'getImage');
            sandbox.stub(Utils, 'activateExternalProvider').resolves(rspController);
            await Utils.getIcon('fakeId', 'fakeType');
            expect(getImageStub).calledOnceWith('fakeType');
        });
    });

});
