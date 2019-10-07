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
import * as tmp from 'tmp';
import * as vscode from 'vscode';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('ServerEditorAdapter', () => {
    let sandbox: sinon.SinonSandbox;
    let serverEditorAdapter: ServerEditorAdapter;
    let stubs: ClientStubs;
    let serverExplorer: ServerExplorer;
    const uriDoc: vscode.Uri = {
        scheme: undefined,
        authority: undefined,
        fragment: undefined,
        fsPath: '/fakepath/',
        path: '/fakepath/',
        query: undefined,
        with: undefined,
        toJSON: undefined,
        toString: () => ''
    };

    const textDocument: vscode.TextDocument = {
        uri: undefined,
        fileName: 'tmpServerConnector-server.json',
        isClosed: false,
        isDirty: false,
        isUntitled: false,
        languageId: '',
        version: 1,
        eol: vscode.EndOfLine.CRLF,
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
    const textDocumentWithUri: vscode.TextDocument = {
        uri: uriDoc,
        ...rest
    };

    const {fileName, ...restWUri} = textDocumentWithUri;
    const textDocumentWithoutTmpName: vscode.TextDocument = {
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

    suite('showEditor', () => {
        test('check if parse method is called with right params', async () => {
            const parseStub = sandbox.stub(vscode.Uri, 'parse');
            await serverEditorAdapter.showEditor('suffix', 'content');
            expect(parseStub).calledOnceWith('untitled:suffix');
        });

        test('check if openTextDocument is called with right params', async () => {
            sandbox.stub(vscode.Uri, 'parse').returns(uriDoc);
            const openTextStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(textDocument);
            await serverEditorAdapter.showEditor('suffix', 'content');
            expect(openTextStub).calledOnceWith(uriDoc);
        });

        test('check if insert method is called with right params', async () => {
            const edit = new vscode.WorkspaceEdit();
            sandbox.stub(vscode.Uri, 'parse').returns(uriDoc);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(textDocument);
            sandbox.stub(vscode, 'WorkspaceEdit').returns(edit);
            const insertStub = sandbox.stub(edit, 'insert');
            await serverEditorAdapter.showEditor('suffix', 'content');
            expect(insertStub).calledOnceWith(uriDoc, new vscode.Position(0, 0), 'content');
        });

        test('check if showTextDocument is called with right param if applyEdit succeed', async () => {
            sandbox.stub(vscode.workspace, 'applyEdit').resolves(true);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(textDocument);
            const showTextStub = sandbox.stub(vscode.window, 'showTextDocument');
            await serverEditorAdapter.showEditor('suffix', 'content');
            expect(showTextStub).calledOnceWith(textDocument);
        });

        test('check if showInformationMessage is called with right param if applyEdit fails', async () => {
            sandbox.stub(vscode.workspace, 'applyEdit').resolves(false);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(textDocument);
            const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
            await serverEditorAdapter.showEditor('suffix', 'content');
            expect(showInfoStub).calledOnceWith('Error Displaying Editor Content');
        });
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
                serverJson: 'json',
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

        test('Check if has method is called if jsonResponse passed to method are valid', async () => {
            const hasStub = sandbox.stub(serverEditorAdapter.RSPServerProperties, 'has').returns(false);
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: 'json',
                status: ProtocolStubs.okStatus
            };
            await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
            expect(hasStub).calledOnceWith('id');
        });

        test('check if createTmpFile is called with right params if RSP Server does not exist in map', async () => {
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: 'json',
                status: ProtocolStubs.okStatus
            };
            sandbox.stub(serverEditorAdapter.RSPServerProperties, 'has').returns(false);
            const createTmpStub = sandbox.stub(serverEditorAdapter, 'createTmpFile' as any);
            await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
            expect(createTmpStub).calledOnceWith(false, 'id', serverJsonResponse);
        });

        test('Check if saveAndShowEditor is called if serverProperties doesn\'t exist', async () => {
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: 'json',
                status: ProtocolStubs.okStatus
            };
            const serverProps: ServerProperties = {
                server: 'id',
                file: 'path'
            };
            const saveShowStub = sandbox.stub(serverEditorAdapter, 'saveAndShowEditor' as any);
            sandbox.stub(serverEditorAdapter.RSPServerProperties, 'has').returns(true);
            sandbox.stub(serverEditorAdapter.RSPServerProperties, 'get').returns([serverProps]);

            await serverEditorAdapter.showServerJsonResponse('id', serverJsonResponse);
            expect(saveShowStub).calledOnceWith('path', 'json');
        });
    });

    suite('createTmpFile', () => {
        let createTmpFile;
        let saveAndShowStub: sinon.SinonStub;
        const serverProperties: ServerProperties = {
            server: 'server',
            file: 'file'
        };
        const serverJsonResponse: Protocol.GetServerJsonResponse = {
            serverHandle: ProtocolStubs.serverHandle,
            serverJson: '',
            status: ProtocolStubs.okStatus
        };

        setup(() => {
            createTmpFile = Reflect.get(serverEditorAdapter, 'createTmpFile').bind(serverEditorAdapter);
            saveAndShowStub = sandbox.stub(serverEditorAdapter, 'saveAndShowEditor' as any);
        });

        test('check if tmp.file is called with right params', async () => {
            const tmpFileStub = sandbox.stub(tmp, 'file');
            await createTmpFile(false, 'id', serverJsonResponse);
            expect(tmpFileStub).calledOnceWith({ prefix: 'tmpServerConnector-id-', postfix: '.json' }, sinon.match.func);
        });

        test('check if error returned if tmp.file fails to create tmp file', async () => {
            sandbox.stub(tmp, 'file').callsArgWith(1, ['error', '']);
            try {
                await createTmpFile(false, 'id', serverJsonResponse);
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not handle server response. Unable to create temp file');
            }

        });

        test('check if new tmp file is added to existing rsp in RSPServerProperties map', async () => {
            serverEditorAdapter.RSPServerProperties.set('id', [serverProperties]);
            expect(serverEditorAdapter.RSPServerProperties.size).equals(1);
            expect(serverEditorAdapter.RSPServerProperties.get('id').length).equals(1);
            sandbox.stub(tmp, 'file').callsArg(1);
            await createTmpFile(true, 'id', serverJsonResponse);
            expect(serverEditorAdapter.RSPServerProperties.size).equals(1);
            expect(serverEditorAdapter.RSPServerProperties.get('id').length).equals(2);
            serverEditorAdapter.RSPServerProperties.delete('id');
        });

        test('check if new rsp + tmp file are added in RSPServerProperties if rsp has not been added yet', async () => {
            expect(serverEditorAdapter.RSPServerProperties.size).equals(0);
            sandbox.stub(tmp, 'file').callsArg(1);
            await createTmpFile(false, 'id', serverJsonResponse);
            expect(serverEditorAdapter.RSPServerProperties.size).equals(1);
            expect(serverEditorAdapter.RSPServerProperties.get('id').length).equals(1);
            serverEditorAdapter.RSPServerProperties.delete('id');
        });

        test('check if saveandShowEditor is called if rsp server already exists in map', async () => {
            serverEditorAdapter.RSPServerProperties.set('id', [serverProperties]);
            sandbox.stub(tmp, 'file').callsArg(1);
            await createTmpFile(true, 'id', serverJsonResponse);
            expect(saveAndShowStub).calledOnce;
            serverEditorAdapter.RSPServerProperties.delete('id');
        });

        test('check if saveAndShowEditor is called if rsp server has just been added to map', async () => {
            sandbox.stub(tmp, 'file').callsArg(1);
            await createTmpFile(false, 'id', serverJsonResponse);
            expect(saveAndShowStub).calledOnce;
            serverEditorAdapter.RSPServerProperties.delete('id');
        });
    });

    suite('saveAndShowEditor', () => {
        let saveAndShowEditor;
        let openTextStub: sinon.SinonStub;

        setup(() => {
            saveAndShowEditor = Reflect.get(serverEditorAdapter, 'saveAndShowEditor').bind(serverEditorAdapter);
            openTextStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(textDocument);
        });

        test('check if writeFile is called with right params', async () => {
            const writeFileStub = sandbox.stub(fs, 'writeFile');
            await saveAndShowEditor('path', 'content');
            expect(writeFileStub).calledOnceWith('path', 'content', undefined, sinon.match.func);
        });

        test('check if openTextDocument is called correctly', async () => {
            await saveAndShowEditor('path', 'content');
            expect(openTextStub).calledOnceWith('path');
        });

        test('check if showTextDocument is correctly called if openTextDocument succeed', async () => {
            const showTextStub = sandbox.stub(vscode.window, 'showTextDocument');
            await saveAndShowEditor('path', 'content');
            expect(showTextStub).calledOnceWith(textDocument);
        });
    });

    suite('onDidSaveTextDocument', () => {

        test('Error if doc passed as param is undefined', async () => {
            try {
                await serverEditorAdapter.onDidSaveTextDocument(undefined);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties');
            }
        });

        test('Error if doc Uri property of doc passed as param is undefined', async () => {
            try {
                await serverEditorAdapter.onDidSaveTextDocument(textDocument);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties - Uri is invalid');
            }
        });

        test('check if isTmpServerPropsFile is called with right param', async () => {
            const isTmpServerStub = sandbox.stub(serverEditorAdapter, 'isTmpServerPropsFile' as any);
            await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
            expect(isTmpServerStub).calledOnceWith('tmpServerConnector-server.json');
        });

        test('Error if server id is not found inside RSPServerProperties', async () => {
            serverEditorAdapter.RSPServerProperties.clear();
            try {
                await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties - server id is invalid');
            }
        });

        test('Error if server handle for current (rspId,serverId) is invalid', async () => {
            const serverProps: ServerProperties = {
                server: 'id',
                file: '/fakepath/'
            };
            serverEditorAdapter.RSPServerProperties.set('id', [serverProps]);
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.serverStateWithoutHandle);
            try {
                await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to save server properties - server is invalid');
            }
        });

        test('Check if saveServerProperties is called with right params', async () => {
            const saveStub = sandbox.stub(serverExplorer, 'saveServerProperties').resolves(ProtocolStubs.updateServerResponse);
            const serverProps: ServerProperties = {
                server: 'id',
                file: '/fakepath/'
            };
            serverEditorAdapter.RSPServerProperties.set('id', [serverProps]);
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            sandbox.stub(serverEditorAdapter, 'createTmpFile' as any).callsFake(() => '');

            await serverEditorAdapter.onDidSaveTextDocument(textDocumentWithUri);
            expect(saveStub).calledOnceWith('id', ProtocolStubs.serverHandle, '');
        });

        test('Check if showInformationMessage is called if saveServerProperties succeed', async () => {
            const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
            sandbox.stub(serverExplorer, 'saveServerProperties').resolves(ProtocolStubs.updateServerResponse);
            const serverProps: ServerProperties = {
                server: 'id',
                file: '/fakepath/'
            };
            serverEditorAdapter.RSPServerProperties.set('id', [serverProps]);
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            sandbox.stub(serverEditorAdapter, 'createTmpFile' as any).callsFake(() => '');

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

        test('Error if client for specified rspServer has not been initialized', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP' as any).returns(undefined);
            try {
                await serverExplorer.saveServerProperties('id', ProtocolStubs.serverHandle, 'text');
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to contact the RSP server.');
            }
        });

        test('Return status ok if server is successfull updated', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const updateStubs = stubs.outgoing.updateServer.callsFake(() => {
                return ProtocolStubs.updateServerResponse;
            });
            const result = await serverExplorer.saveServerProperties('id', ProtocolStubs.serverHandle, 'text');

            expect(updateStubs).calledOnce;
            expect(result).equals(ProtocolStubs.updateServerResponse);
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
                expect(err).equals('Error closing document - document is invalid');
            }
        });

        test('unlink if doc is tmp file', async () => {
            const unlinkStub = sandbox.stub(fs, 'unlink');

            await serverEditorAdapter.onDidCloseTextDocument(textDocumentWithUri);
            expect(unlinkStub).calledOnceWith('/fakepath/', sinon.match.func);
        });

        test('don\'t do anything if file is not a tmp file', async () => {
            const unlinkStub = sandbox.stub(fs, 'unlink');

            await serverEditorAdapter.onDidCloseTextDocument(textDocumentWithoutTmpName);
            sandbox.assert.notCalled(unlinkStub);
        });

    });

});
