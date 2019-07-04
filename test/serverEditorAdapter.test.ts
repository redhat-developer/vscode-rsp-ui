/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import { ClientStubs } from './clientstubs';
import * as fs from 'fs';
import { ProtocolStubs } from './protocolstubs';
import { Protocol } from 'rsp-client';
import { ServerEditorAdapter, ServerProperties } from '../src/serverEditorAdapter';
import { ServerExplorer } from '../src/serverExplorer';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { EndOfLine, TextDocument, Uri, window } from 'vscode';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('ServerEditorAdapter', () => {
    let sandbox: sinon.SinonSandbox;
    let serverEditorAdapter: ServerEditorAdapter;
    let stubs: ClientStubs;
    let serverExplorer: ServerExplorer;
    const uriDoc: Uri = {
        scheme: undefined,
        authority: undefined,
        fragment: undefined,
        fsPath: '/fakepath/',
        path: '/fakepath/',
        query: undefined,
        with: undefined,
        toJSON: undefined,
        toString: undefined
    };

    const textDocument: TextDocument = {
        uri: undefined,
        fileName: 'tmpServerConnector-server.json',
        isClosed: false,
        isDirty: false,
        isUntitled: false,
        languageId: '',
        version: 1,
        eol: EndOfLine.CRLF,
        save: undefined,
        lineCount: 33,
        lineAt: undefined,
        getText: () => '',
        getWordRangeAtPosition: undefined,
        offsetAt: undefined,
        positionAt: undefined,
        validatePosition: undefined,
        validateRange: undefined
    };

    const {uri, ...rest} = textDocument;
    const textDocumentWithUri: TextDocument = {
        uri: uriDoc,
        ...rest
    };

    const {fileName, ...restWUri} = textDocumentWithUri;
    const textDocumentWithoutTmpName: TextDocument = {
        fileName: 'file.json',
        ...restWUri
    };

    setup(() => {
        sandbox = sinon.createSandbox();

        stubs = new ClientStubs(sandbox);
        stubs.outgoing.getServerHandles = sandbox.stub().resolves([ProtocolStubs.serverHandle]);
        stubs.outgoing.getServerState = sandbox.stub().resolves(ProtocolStubs.unknownServerState);

        serverExplorer = ServerExplorer.getInstance();

        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);

        serverEditorAdapter = ServerEditorAdapter.getInstance(serverExplorer);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('showServerJsonResponse', () => {

        test('Error if server json Response is Empty', async () => {
            try {
                await serverEditorAdapter.showServerJsonResponse('id', undefined);
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not handle server response: empty/invalid response');
            }
        });

        test('Error if serverHandle property of server json Response is Empty', async () => {
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: undefined,
                serverJson: '',
                status: ProtocolStubs.okStatus
            };

            try {
                await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not handle server response: empty/invalid response');
            }
        });

        test('Error if serverJson property of server json Response is Empty', async () => {
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: undefined,
                status: ProtocolStubs.okStatus
            };

            try {
                await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not handle server response: empty/invalid response');
            }
        });

        test('Check if method checks if RSP Server exist if jsonResponse is valid', async () => {
            const hasStub = sandbox.stub(serverEditorAdapter.RSPServerProperties, 'has').returns(false);

            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: '',
                status: ProtocolStubs.okStatus
            };

            try {
                await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
                expect(hasStub).calledOnceWith('id');
                expect.fail();
            } catch (err) {

            }

        });

        test('Check if saveAndShowEditor is called if serverProperties doesn\'t exist', async () => {
            const serverProps: ServerProperties = {
                server: 'id',
                file: 'path'
            };
            const saveShowStub = sandbox.stub(serverEditorAdapter, 'saveAndShowEditor' as any);
            sandbox.stub(serverEditorAdapter.RSPServerProperties, 'has').returns(true);
            sandbox.stub(serverEditorAdapter.RSPServerProperties, 'get').returns([serverProps]);

            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: '',
                status: ProtocolStubs.okStatus
            };
            try {
                await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
                expect(saveShowStub).calledOnceWith('path', '');
                expect.fail();
            } catch (err) {}

        });
    });

    suite('onDidSaveTextDocument', () => {

        test('Error savings temp file if doc is undefined', async () => {

            try {
                await serverEditorAdapter.onDidSaveTextDocument(undefined);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties');
            }

        });

        test('Error savings temp file if doc Uri is undefined', async () => {

            try {
                await serverEditorAdapter.onDidSaveTextDocument(textDocument);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties - Uri is invalid');
            }

        });

        test('Error savings temp file if server id is undefined', async () => {

            sandbox.stub(serverExplorer, 'getServerStateById').resolves(undefined);

            try {
                await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties - server id is invalid');
            }

        });

        test('Check if saveServerProperties is called with right params', async () => {
            const saveStub = sandbox.stub(serverExplorer, 'saveServerProperties').resolves(ProtocolStubs.okStatus);
            const serverProps: ServerProperties = {
                server: 'id',
                file: '/fakepath/'
            };
            serverEditorAdapter.RSPServerProperties.set('id', [serverProps]);
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);

            await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
            expect(saveStub).calledOnceWith('id', ProtocolStubs.serverHandle, '');
        });

        test('Check if showInformationMessage is called if saveServerProperties succeed', async () => {
            const showInfoStub = sandbox.stub(window, 'showInformationMessage');
            sandbox.stub(serverExplorer, 'saveServerProperties').resolves(ProtocolStubs.okStatus);
            const serverProps: ServerProperties = {
                server: 'id',
                file: '/fakepath/'
            };
            serverEditorAdapter.RSPServerProperties.set('id', [serverProps]);
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);

            await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
            expect(showInfoStub).calledOnceWith('Server id correctly saved');
        });

    });

    suite('saveServerproperties', () => {

        test('Error updating server if serverhandle is empty', async () => {

            try {
                await serverExplorer.saveServerProperties('id', undefined, 'text');
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to update server properties - Invalid server');
            }

        });

        test('Error updating server if content is empty', async () => {

            try {
                await serverExplorer.saveServerProperties('id', ProtocolStubs.serverHandle, '');
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to update server properties for server id - Invalid content');
            }

        });

        test('Return status ok if server is successfull updated', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const updateStubs = stubs.outgoing.updateServer.callsFake(() => {
                return ProtocolStubs.updateServerResponse;
            });
            const result = await serverExplorer.saveServerProperties('id', ProtocolStubs.serverHandle, 'text');

            expect(updateStubs).calledOnce;
            expect(result).equals(ProtocolStubs.createResponseOK.status);

        });

        test('Return error if server is not updated', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const updateStubs = stubs.outgoing.updateServer.callsFake(() => {
                ProtocolStubs.updateServerResponse.validation = ProtocolStubs.createResponseKO;
                return ProtocolStubs.updateServerResponse;
            });
            try {
                await serverExplorer.saveServerProperties('id', ProtocolStubs.serverHandle, 'text');

                expect(updateStubs).calledOnce;
                expect.fail();
            } catch (err) {
                expect(err).equals(ProtocolStubs.createResponseKO.status.message);
            }

        });

    });

    suite('onDidCloseTextDocument', () => {

        test('reject if doc is undefined', async () => {
            try {
                await serverEditorAdapter.onDidCloseTextDocument(undefined);
                expect.fail();
            } catch (err) {
            }
        });

        test('unlink if doc is tmp file', async () => {
            const unlinkStub = sandbox.stub(fs, 'unlink').callsFake((path, error) => {});

            await serverEditorAdapter.onDidCloseTextDocument(textDocumentWithUri);
            expect(unlinkStub).calledOnce;
        });

        test('don\'t do anything if file is not a tmp file', async () => {
            const unlinkStub = sandbox.stub(fs, 'unlink').callsFake((path, error) => {});

            await serverEditorAdapter.onDidCloseTextDocument(textDocumentWithoutTmpName);
            sandbox.assert.notCalled(unlinkStub);
        });

    });

});
