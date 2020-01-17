/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import * as chaipromise from 'chai-as-promised';
import { ClientStubs } from './clientstubs';
import { DebugInfo } from '../src/debug/debugInfo';
import { DebugInfoProvider } from '../src/debug/debugInfoProvider';
import { EventEmitter } from 'events';
import { CommandHandler, ServerActionItem } from '../src/extensionApi';
import { JavaDebugSession } from '../src/debug/javaDebugSession';
import { ProtocolStubs } from './protocolstubs';
import { Protocol, ServerState } from 'rsp-client';
import { ServerEditorAdapter } from '../src/serverEditorAdapter';
import { ServerExplorer, ServerStateNode } from '../src/serverExplorer';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { Utils } from '../src/utils/utils';
import * as vscode from 'vscode';
import { RSPController, ServerInfo } from 'vscode-server-connector-api';
import { WorkflowResponseStrategyManager } from '../src/workflow/response/workflowResponseStrategyManager';

const expect = chai.expect;
chai.use(sinonChai);
chai.use(chaipromise);

suite('Command Handler', () => {
    let sandbox: sinon.SinonSandbox;
    let sandboxDebug: sinon.SinonSandbox;
    let stubs: ClientStubs;
    let handler: CommandHandler;
    let serverExplorer: ServerExplorer;

    setup(() => {
        sandbox = sinon.createSandbox();
        sandboxDebug = sinon.createSandbox();

        stubs = new ClientStubs(sandbox);
        stubs.outgoing.getServerHandles = sandbox.stub().resolves([ProtocolStubs.serverHandle]);
        stubs.outgoing.getServerState = sandbox.stub().resolves(ProtocolStubs.unknownServerState);

        serverExplorer = ServerExplorer.getInstance();
        handler = new CommandHandler(serverExplorer);

        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);
    });

    teardown(() => {
        sandbox.restore();
        sandboxDebug.restore();
    });

    test('activate registers event listeners', async () => {
        stubs.incoming.onServerAdded.reset();
        stubs.incoming.onServerRemoved.reset();
        stubs.incoming.onServerStateChanged.reset();
        stubs.incoming.onServerProcessOutputAppended.reset();

        await handler.activate('type', stubs.client);

        expect(stubs.incoming.onServerAdded).calledOnce;
        expect(stubs.incoming.onServerRemoved).calledOnce;
        expect(stubs.incoming.onServerStateChanged).calledOnce;
        expect(stubs.incoming.onServerProcessOutputAppended).calledOnce;
    });

    suite('startRSP', () => {
        let serverInfo: ServerInfo;
        let rspProvider: RSPController;
        setup(() => {
            serverInfo = {
                host: 'localhost',
                port: 8080
            };
            rspProvider = {
                getHost: () => 'localhost',
                getPort: () => 8080,
                getImage: (type: string) => vscode.Uri.parse('path'),
                onRSPServerStateChanged: () => {},
                startRSP: (stdOut: (data: string) => void, stdErr: (data: string) => void) => Promise.resolve(serverInfo),
                stopRSP: () => Promise.resolve()
            };
        });

        test('check if selectRSP method is called if context is undefined', async () => {
            const selectRSPStub = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.startRSP(undefined);
            expect(selectRSPStub).calledOnce;
        });

        test('error if state is different from STOPPED and UNKNOWN', async () => {
            try {
                await handler.startRSP(ProtocolStubs.rspStateStarted);
                expect.fail();
            } catch (err) {
                expect(err).equals('The RSP server the type is already running.');
            }
        });

        test('check if activateExternalProvider is called with right id', async () => {
            const activateExtStub = sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            await handler.startRSP(ProtocolStubs.rspState);
            expect(activateExtStub).calledOnceWith('id');
        });

        test('error if activateExternalProvider receive id of an extension not installed', async () => {
            sandbox.stub(vscode.extensions, 'getExtension').resolves(undefined);
            try {
                await handler.startRSP(ProtocolStubs.rspState);
                expect.fail();
            } catch (err) {
                expect(err).equals(`Failed to retrieve id extension`);
            }
        });

        test('check if setRSPListener is called with right params', async () => {
            sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            const listenerStub = sandbox.stub(handler, 'setRSPListener').resolves(undefined);
            await handler.startRSP(ProtocolStubs.rspState);
            expect(listenerStub).calledOnceWith('id', rspProvider);
        });

        test('error if rspProvider.startRSP returns not valid response', async () => {
            sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            rspProvider.startRSP = (stdOut: (data: string) => void, stdErr: (data: string) => void) => Promise.resolve(undefined);
            try {
                await handler.startRSP(ProtocolStubs.rspState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to start the the type RSP server');
            }
        });

        test('check refreshTree is called once', async () => {
            const initRSPNodeStub = sandbox.stub(serverExplorer, 'initRSPNode');
            sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            await handler.startRSP(ProtocolStubs.rspState);
            expect(initRSPNodeStub).calledOnce;
        });
    });

    suite('stopRSP', async () => {

        let serverInfo: ServerInfo;
        let rspProvider: RSPController;
        let disposeRSPStub: sinon.SinonStub;
        let updateStub: sinon.SinonStub;
        setup(() => {
            serverInfo = {
                host: 'localhost',
                port: 8080
            };
            rspProvider = {
                getHost: () => 'localhost',
                getPort: () => 8080,
                getImage: (type: string) => vscode.Uri.parse('path'),
                onRSPServerStateChanged: () => {},
                startRSP: (stdOut: (data: string) => void, stdErr: (data: string) => void) => Promise.resolve(serverInfo),
                stopRSP: () => Promise.resolve()
            };
            disposeRSPStub = sandbox.stub(serverExplorer, 'disposeRSPProperties');
            updateStub = sandbox.stub(serverExplorer, 'updateRSPServer');
        });

        test('check if selectRSP method is called with right params if context is undefined and forced is true', async () => {
            const message = 'Select RSP provider you want to start';
            const selectRSPStub = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.stopRSP(true, undefined);
            expect(selectRSPStub).calledOnceWith(message, sinon.match.func);
        });

        test('check if selectRSP method is called with right params if context is undefined and forced is false', async () => {
            const message = 'Select RSP provider you want to start';
            const selectRSPStub = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.stopRSP(false, undefined);
            expect(selectRSPStub).calledWithMatch(message, sinon.match.func);
        });

        test('error if state is STOPPED or UNKNOWN', async () => {
            try {
                await handler.stopRSP(false, ProtocolStubs.rspState);
                expect.fail();
            } catch (err) {
                expect(err).equals('The RSP server the type is already stopped.');
            }
        });

        test('check if getClient is called with right param', async () => {
            const getClientStub = sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            await handler.stopRSP(false, ProtocolStubs.rspStateStarted);
            expect(getClientStub).calledOnceWith('id');
        });

        test('error if rsp\'s client is undefined', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(undefined);
            try {
                await handler.stopRSP(false, ProtocolStubs.rspStateStarted);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to contact the RSP server the type.');
            }
        });

        test('check if updateState is called twice if not forced or forced and no error occured', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            await handler.stopRSP(false, ProtocolStubs.rspStateStarted);
            expect(updateStub).calledTwice;
        });

        test('check that shutdown server is called if stop is not forced', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            await handler.stopRSP(false, ProtocolStubs.rspStateStarted);
            expect(stubs.clientStub.shutdownServer).calledOnce;
        });

        test('check if external rsp provider is called if stop is forced', async () => {
            const activateExtStub = sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            await handler.stopRSP(true, ProtocolStubs.rspStateStarted);
            expect(activateExtStub).calledOnceWith('id');
        });

        test('error if external rsp provider stopRSP method returns an error', async () => {
            rspProvider.stopRSP = () => Promise.reject('error');
            sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            try {
                await handler.stopRSP(true, ProtocolStubs.rspStateStarted);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to terminate the type - error');
            }
        });

        test('check if updateState is called three times if forced and error occured', async () => {
            rspProvider.stopRSP = () => Promise.reject('error');
            sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            try {
                await handler.stopRSP(true, ProtocolStubs.rspStateStarted);
                expect(updateStub).calledThrice;
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to terminate the type - error');
            }
        });

        test('check if disposeRSp is called with right param', async () => {
            sandbox.stub(Utils, 'activateExternalProvider' as any).resolves(rspProvider);
            await handler.stopRSP(true, ProtocolStubs.rspStateStarted);
            expect(disposeRSPStub).calledOnceWith('id');
        });

    });

    suite('startServer', () => {
        let statusStub: sinon.SinonStub;
        let getClientStub: sinon.SinonStub;
        let startStub: sinon.SinonStub;

        setup(() => {
            statusStub = sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            getClientStub = sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            startStub = sandbox.stub().resolves(ProtocolStubs.okStartServerResponse);
            stubs.outgoing.startServerAsync = startStub;
        });

        test('works with injected context', async () => {
            const result = await handler.startServer('run', ProtocolStubs.unknownServerState);
            const args: Protocol.LaunchParameters = {
                mode: 'run',
                params: {
                    serverType: ProtocolStubs.serverHandle.type.id,
                    id: ProtocolStubs.serverHandle.id,
                    attributes: new Map<string, any>()
                }
            };

            expect(result).equals(ProtocolStubs.okStartServerResponse);
            expect(startStub).calledOnceWith(args);
        });

        test('works with injected context', async () => {
            const result = await handler.startServer('run', ProtocolStubs.unknownServerState);
            const args: Protocol.LaunchParameters = {
                mode: 'run',
                params: {
                    serverType: ProtocolStubs.serverHandle.type.id,
                    id: ProtocolStubs.serverHandle.id,
                    attributes: new Map<string, any>()
                }
            };

            expect(result).equals(ProtocolStubs.okStartServerResponse);
            expect(startStub).calledOnceWith(args);
        });

        test('works without injected context', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            const result = await handler.startServer('run');
            const args: Protocol.LaunchParameters = {
                mode: 'run',
                params: {
                    serverType: ProtocolStubs.serverType.id,
                    id: 'id',
                    attributes: new Map<string, any>()
                }
            };

            expect(result).equals(ProtocolStubs.okStartServerResponse);
            expect(startStub).calledOnceWith(args);
        });

        test('errors if the server is already running', async () => {
            statusStub.returns(ServerState.STARTED);

            try {
                await handler.startServer('run', ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('The server is already running.');
            }
        });

        test('error if client doesn\'t exist', async () => {
            getClientStub.reset();
            getClientStub.returns(undefined);

            try {
                await handler.startServer('run', ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to contact the RSP server.');
            }
        });

        test('throws any errors coming from the rsp client', async () => {
            const result: Protocol.StartServerResponse = {
                details: ProtocolStubs.cmdDetails,
                status: ProtocolStubs.errorStatus
            };
            startStub.resolves(result);

            try {
                await handler.startServer('run', ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals(ProtocolStubs.errorStatus.message);
            }
        });
    });

    suite('debugServer', () => {
        let startStub: sinon.SinonStub;
        let getClientStub : sinon.SinonStub;

        const cmdDetails: Protocol.CommandLineDetails = {
            cmdLine: [''],
            envp: [],
            properties: {
                'debug.details.type': 'c#'
            },
            workingDir: 'dir'
        };

        const response: Protocol.StartServerResponse = {
            details: cmdDetails,
            status: ProtocolStubs.okStatus
        };

        setup(() => {
            startStub = sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            getClientStub = sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            startStub = sandbox.stub().resolves(response);
            stubs.outgoing.startServerAsync = startStub;
        });

        test('error if client doesn\'t exist', async () => {
            getClientStub.reset();
            getClientStub.returns(undefined);

            try {
                await handler.debugServer(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to contact the RSP server.');
            }
        });

        test('display error if no debugInfo passed', async () => {
            sandbox.stub(DebugInfoProvider, 'retrieve').resolves(undefined);
            try {
                await handler.debugServer(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not find server debug info.');
            }
        });

        test('check if retrieve method called with right params', async () => {
            const debugInfo: DebugInfo = new DebugInfo(cmdDetails);
            sandbox.stub(debugInfo, 'isJavaType').returns(true);
            const retrieveStub = sandbox.stub(DebugInfoProvider, 'retrieve').callsFake((serverHandle, client) => {
                return Promise.resolve(debugInfo);
            });
            try {
                await handler.debugServer(ProtocolStubs.unknownServerState);
                expect(retrieveStub).calledOnceWith(ProtocolStubs.serverHandle, stubs.client);
            } catch (err) {

            }
        });

        test('display error if language is not supported', async () => {
            // given
            stubs.outgoing.getLaunchCommand = sandbox.stub().resolves(cmdDetails);
            const debugInfo: DebugInfo = new DebugInfo(cmdDetails as Protocol.CommandLineDetails);
            sandbox.stub(debugInfo, 'isJavaType').returns(false);
            sandbox.stub(DebugInfoProvider, 'retrieve').resolves(debugInfo);
            // when
            try {
                await handler.debugServer(ProtocolStubs.unknownServerState);
            } catch (err) {
                expect(err).equals(`vscode-rsp-ui doesn't support debugging with c# language at this time.`);
            }
        });

        test('starts server & debugging with given server', async () => {
            // given
            givenDebugTypeIsSupported(sandbox, handler);
            const startServerStub = givenServerStarted(sandbox, handler);
            const startDebuggingStub = sandbox.stub(vscode.debug, 'startDebugging');
            givenProcessOutput(sandbox, stubs);
            // when
            await handler.debugServer(ProtocolStubs.unknownServerState);
            // then
            sandbox.assert.calledOnce(startServerStub);
            sandbox.assert.calledOnce(startDebuggingStub);
        });

        test('starts server & debugging without given but prompted server', async () => {
            // given
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            givenDebugTypeIsSupported(sandbox, handler);
            const startServerStub = givenServerStarted(sandbox, handler);
            const startDebuggingStub = sandbox.stub(vscode.debug, 'startDebugging');
            givenProcessOutput(sandbox, stubs);
            // when
            await handler.debugServer(undefined);
            // then
            sandbox.assert.calledOnce(startServerStub);
            sandbox.assert.calledOnce(startDebuggingStub);
        });

    });

    suite('stopServer', () => {
        let statusStub: sinon.SinonStub;
        let getClientStub: sinon.SinonStub;
        let stopStub: sinon.SinonStub;

        setup(() => {
            statusStub = sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.startedServerState);
            getClientStub = sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stopStub = stubs.outgoing.stopServerAsync = sandbox.stub().resolves(ProtocolStubs.okStatus);
            sandbox.stub(vscode.window, 'showQuickPick').resolves('id');
        });

        test('works with injected context', async () => {
            const result = await handler.stopServer(false, ProtocolStubs.startedServerState);
            const args: Protocol.StopServerAttributes = {
                id: ProtocolStubs.serverHandle.id,
                force: false
            };

            expect(result).equals(ProtocolStubs.okStatus);
            expect(stopStub).calledOnceWith(args);
        });

        test('works without injected context', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            const result = await handler.stopServer(false);
            const args: Protocol.StopServerAttributes = {
                id: 'id',
                force: false
            };

            expect(result).equals(ProtocolStubs.okStatus);
            expect(stopStub).calledOnceWith(args);
        });

        test('errors if the server is already stopped', async () => {
            statusStub.returns(ServerState.STOPPED);

            try {
                await handler.stopServer(false, ProtocolStubs.stoppedServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('The server is already stopped.');
            }
        });

        test('error if client doesn\'t exist', async () => {
            getClientStub.reset();
            getClientStub.returns(undefined);

            try {
                await handler.stopServer(false, ProtocolStubs.startedServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to contact the RSP server.');
            }
        });

        test('check if debugSession.Stop is called if debugger already started', async () => {
            const debugSession: JavaDebugSession = Reflect.get(handler, 'debugSession');
            sandbox.stub(debugSession, 'isDebuggerStarted').returns(true);
            const stopDebug = sandbox.stub(debugSession, 'stop');

            await handler.stopServer(false, ProtocolStubs.startedServerState);
            expect(stopDebug).calledOnce;
        });

        test('error if stopServerAsync fails', async () => {
            stopStub.reset();
            stopStub.resolves(ProtocolStubs.errorStatus);
            try {
                await handler.stopServer(false, ProtocolStubs.startedServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Critical Error');
            }
        });

        test('throws any errors coming from the rsp client', async () => {
            stopStub.resolves(ProtocolStubs.errorStatus);

            try {
                await handler.stopServer(true, ProtocolStubs.startedServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('The server is already stopped.');
            }
        });
    });

    suite('terminateServer', () => {
        let statusStub: sinon.SinonStub;
        let stopStub: sinon.SinonStub;

        setup(() => {
            const serverStateInternal: ServerStateNode =  {
                server: ProtocolStubs.serverHandle,
                deployableStates: [],
                publishState: 0,
                runMode: ServerState.RUN_MODE_RUN,
                state: ServerState.STARTING,
                rsp: 'id'
            };

            statusStub = sandbox.stub(serverExplorer, 'getServerStateById').returns(serverStateInternal);
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stopStub = stubs.outgoing.stopServerAsync.resolves(ProtocolStubs.okStatus);
            sandbox.stub(vscode.window, 'showQuickPick').resolves('id');
        });

        test('works with injected context', async () => {
            const result = await handler.stopServer(true, ProtocolStubs.startedServerState);
            const args: Protocol.StopServerAttributes = {
                id: ProtocolStubs.startedServerState.server.id,
                force: true
            };

            expect(result).equals(ProtocolStubs.okStatus);
            expect(stopStub).calledOnceWith(args);
        });

        test('works without injected context', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            const result = await handler.stopServer(true);
            const args: Protocol.StopServerAttributes = {
                id: 'id',
                force: true
            };

            expect(result).equals(ProtocolStubs.okStatus);
            expect(stopStub).calledOnceWith(args);
        });

        test('errors if the server is already stopped', async () => {
            statusStub.returns(ServerState.STOPPED);

            try {
                await handler.stopServer(false, ProtocolStubs.stoppedServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('The server is already stopped.');
            }
        });

    });

    suite('removeServer', () => {
        let statusStub: sinon.SinonStub;
        let removeStub: sinon.SinonStub;

        setup(() => {
            const serverStateInternal: ServerStateNode =  {
                server: ProtocolStubs.serverHandle,
                deployableStates: [],
                publishState: 0,
                runMode: ServerState.RUN_MODE_RUN,
                state: ServerState.STOPPED,
                rsp: 'id'
            };

            statusStub = sandbox.stub(serverExplorer, 'getServerStateById').returns(serverStateInternal);
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            removeStub = stubs.outgoing.deleteServer.resolves(ProtocolStubs.okStatus);
            sandbox.stub(vscode.window, 'showQuickPick').resolves('id');
        });

        test('works with injected context', async () => {
            sandbox.stub(vscode.window, 'showWarningMessage').resolves('Yes');
            const result = await handler.removeServer(ProtocolStubs.unknownServerState);
            const args: Protocol.ServerHandle = {
                id: ProtocolStubs.serverHandle.id,
                type: ProtocolStubs.serverHandle.type
            };

            expect(result).equals(ProtocolStubs.okStatus);
            expect(removeStub).calledOnceWith(args);
        });

        test('works without injected context', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(vscode.window, 'showWarningMessage').resolves('Yes');
            const result = await handler.removeServer();
            const args: Protocol.ServerHandle = {
                id: 'id',
                type: ProtocolStubs.serverType
            };

            expect(result).equals(ProtocolStubs.okStatus);
            expect(removeStub).calledOnceWith(args);
        });

        test('errors if the server is not stopped', async () => {
            sandbox.stub(vscode.window, 'showWarningMessage').resolves('Yes');
            statusStub.returns(ServerState.STARTED);

            try {
                await handler.removeServer(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).to.include(ProtocolStubs.unknownServerState.server.id);
            }
        });

        test('throws any errors coming from the rsp client', async () => {
            sandbox.stub(vscode.window, 'showWarningMessage').resolves('Yes');
            removeStub.resolves(ProtocolStubs.errorStatus);

            try {
                await handler.removeServer(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals(ProtocolStubs.errorStatus.message);
            }
        });

        test('wont remove if user does not confirm', async () => {
            sandbox.stub(vscode.window, 'showWarningMessage').resolves();
            expect(removeStub).not.called;
        });
    });

    suite('showServerOutput', () => {
        let showOutputStub: sinon.SinonStub;

        setup(() => {
            showOutputStub = sandbox.stub(serverExplorer, 'showOutput');
        });

        test('check if showOutput called with context passed as param', async () => {
            await handler.showServerOutput(ProtocolStubs.unknownServerState);
            expect(showOutputStub).calledOnceWith(ProtocolStubs.unknownServerState);
        });

        test('check if selectRSP is called if no context is passed', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.showServerOutput(undefined);
            expect(selectRSP).calledOnceWith(sinon.match.string);
        });

        test('check if selectServer is called if no context is passed', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            await handler.showServerOutput(undefined);
            expect(selectServerStub).calledOnceWith('id', 'Select server to show output channel');
        });

        test('check if showOutput called with right context if nothing is passed as param', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            await handler.showServerOutput(undefined);
            expect(showOutputStub).calledOnceWith(ProtocolStubs.unknownServerState);
        });
    });

    suite('restartServer', () => {
        let stopStub: sinon.SinonStub;

        setup(() => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stopStub = sandbox.stub(handler, 'stopServer').resolves(ProtocolStubs.okStatus);
            sandbox.stub(vscode.window, 'showQuickPick').resolves(ProtocolStubs.serverHandle.id);
            stubs.incoming.onServerStateChanged = sandbox.stub().resolves(ProtocolStubs.stoppedServerState);
        });

        test('should restart with given server', async () => {
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.startedServerState);
            // when
            await handler.restartServer('run', ProtocolStubs.startedServerState);

            // then
            expect(stubs.incoming.onServerStateChanged).calledBefore(stopStub);
            expect(stopStub).calledOnceWith(false, ProtocolStubs.startedServerState);
        });

        test('should restart without given but prompted server', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.startedServerState);

            // when
            await handler.restartServer('run');

            // then
            expect(stubs.incoming.onServerStateChanged).calledBefore(stopStub);
            expect(stopStub).calledOnceWith(false, ProtocolStubs.startedServerState);
        });

        test('call startServer method if restart in run_mode', async () => {
            const startServerStub = sandbox.stub(handler, 'startServer');
            const emitter = new EventEmitter();
            const serverStateStopped = {
                ...ProtocolStubs.serverState,
                state: ServerState.STOPPED
            };
            const listener = handler.getRestartListener(ServerState.RUN_MODE_RUN, ProtocolStubs.startedServerState, stubs.client);
            emitter.addListener('listener', listener);
            emitter.emit('listener', serverStateStopped);
            expect(startServerStub).calledOnce;
        });

        test('call debugServer method if restart in debug_mode', async () => {
            const debugServerStub = sandbox.stub(handler, 'debugServer');
            const emitter = new EventEmitter();
            const serverStateStopped = {
                ...ProtocolStubs.serverState,
                state: ServerState.STOPPED
            };
            const listener = handler.getRestartListener(ServerState.RUN_MODE_DEBUG, ProtocolStubs.startedServerState, stubs.client);
            emitter.addListener('listener', listener);
            emitter.emit('listener', serverStateStopped);
            expect(debugServerStub).calledOnce;
        });

        test('error if mode doesn\'t contains a valid value', async () => {
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            const emitter = new EventEmitter();
            const serverStateStopped = {
                ...ProtocolStubs.serverState,
                state: ServerState.STOPPED
            };
            const listener = handler.getRestartListener('fakeMode', ProtocolStubs.startedServerState, stubs.client);
            emitter.addListener('listener', listener);
            emitter.emit('listener', serverStateStopped);
            expect(showErrorStub).calledOnceWith('Could not restart server: unknown mode fakeMode');
        });
    });

    suite('restartServerInDebug', () => {
        let stopStub: sinon.SinonStub;

        setup(() => {
            stopStub = sandbox.stub(handler, 'stopServer').resolves(ProtocolStubs.okStatus);
            stubs.outgoing.getLaunchCommand = sandbox.stub().resolves(ProtocolStubs.javaCommandLine);
            sandbox.stub(vscode.window, 'showQuickPick').resolves(ProtocolStubs.serverHandle.id);
            sandbox.stub(handler, 'checkExtension' as any).resolves(undefined);
            stubs.incoming.onServerStateChanged = sandbox.stub().resolves(ProtocolStubs.stoppedServerState);
        });

        test('should restart with given server', async () => {
            // when
            await handler.restartServer('debug', ProtocolStubs.startedServerState);

            // then
            expect(stubs.incoming.onServerStateChanged).calledBefore(stopStub);
            expect(stopStub).calledOnceWith(false, ProtocolStubs.startedServerState);
        });

        test('should restart without given but prompted server', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.startedServerState);

            // when
            await handler.restartServer('debug');

            // then
            expect(stubs.incoming.onServerStateChanged).calledBefore(stopStub);
            expect(stopStub).calledOnceWith(false, ProtocolStubs.startedServerState);
        });
    });

    suite('addDeployment', () => {
        let addDeploymentStub: sinon.SinonStub;

        setup(() => {
            addDeploymentStub = sandbox.stub(serverExplorer, 'selectAndAddDeployment');
        });

        test('addDeployment called with right context if context passed as param', async () => {
            await handler.addDeployment(ProtocolStubs.unknownServerState);
            expect(addDeploymentStub).calledOnceWith(ProtocolStubs.unknownServerState);
        });

        test('check if selectRSP is called if no context is passed', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.addDeployment(undefined);
            expect(selectRSP).calledOnceWith(sinon.match.string);
        });

        test('check if selectServer is called if no context is passed', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            await handler.addDeployment(undefined);
            expect(selectServerStub).calledOnceWith('id', 'Select server to deploy to');
        });

        test('check if addDeployment called with right context if nothing is passed as param', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            await handler.addDeployment(undefined);
            expect(addDeploymentStub).calledOnceWith(ProtocolStubs.unknownServerState);
        });

        test('error if explorer has not been initialized', async () => {
            const nullHandler = new CommandHandler(null);

            try {
                await nullHandler.addDeployment(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Runtime Server Protocol (RSP) Server is starting, please try again later.');
            }
        });
    });

    suite('removeDeployment', () => {
        let removeDeploymentStub: sinon.SinonStub;

        setup(() => {
            removeDeploymentStub = sandbox.stub(serverExplorer, 'removeDeployment');
        });

        test('removedDeployment called with right context if context passed as param', async () => {
            await handler.removeDeployment(ProtocolStubs.deployableStateNode);
            expect(removeDeploymentStub).calledOnceWith('id', ProtocolStubs.serverHandle, ProtocolStubs.deployableReference);
        });

        test('check if selectRSP is called if no context is passed', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.removeDeployment(undefined);
            expect(selectRSP).calledOnceWith(sinon.match.string);
        });

        test('check if selectServer is called if no context is passed', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            await handler.removeDeployment(undefined);
            expect(selectServerStub).calledOnceWith('id', 'Select server to remove deployment from', sinon.match.func);
        });

        test('check if showQuickPick is called if no context is passed', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.startedServerState);
            const deployable = {
                label: 'fake',
                deployable: ProtocolStubs.deployableStateNode
            };
            const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
            await handler.removeDeployment(undefined);
            expect(quickPickStub).calledOnceWith([deployable], { placeHolder: 'Select deployment to remove' });
        });

        test('removedDeployment called with right context if no context is passed as param', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.startedServerState);
            const deployable = {
                label: 'fake',
                deployable: ProtocolStubs.deployableStateNode
            };
            sandbox.stub(vscode.window, 'showQuickPick').resolves(deployable);
            await handler.removeDeployment(ProtocolStubs.deployableStateNode);
            expect(removeDeploymentStub).calledOnceWith('id', ProtocolStubs.serverHandle, ProtocolStubs.deployableReference);
        });

    });

    suite('publishServer', () => {
        let publishStub: sinon.SinonStub;

        setup(() => {
            publishStub = sandbox.stub(serverExplorer, 'publish');
        });

        test('publishServer called with right context if context passed as param', async () => {
            await handler.publishServer(ServerState.PUBLISH_FULL, ProtocolStubs.unknownServerState);
            expect(publishStub).calledOnceWith('id', ProtocolStubs.serverHandle, 2);
        });

        test('check if selectRSP is called if no context is passed', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.publishServer(ServerState.PUBLISH_FULL, undefined);
            expect(selectRSP).calledOnceWith('Select RSP provider you want to retrieve servers');
        });

        test('check if selectServer is called if no context is passed', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            await handler.publishServer(ServerState.PUBLISH_FULL, undefined);
            expect(selectServerStub).calledOnceWith('id', 'Select server to publish');
        });

        test('check if publishServer called with right context if nothing is passed as param', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            await handler.publishServer(ServerState.PUBLISH_FULL, undefined);
            expect(publishStub).calledOnceWith('id', ProtocolStubs.serverHandle, 2);
        });

    });

    suite('createServer', () => {

        test('check if runtime method is called if user picks Yes answer with context passed as param', async () => {
            const downloadRuntimeStub = sandbox.stub(handler, 'downloadRuntime');
            sandbox.stub(vscode.window, 'showQuickPick').resolves('Yes');
            await handler.createServer(ProtocolStubs.rspState);
            expect(downloadRuntimeStub).calledOnceWith('id');
        });

        test('check if addLocation method is called if user picks No answer with context passed as param', async () => {
            const addLocationStub = sandbox.stub(handler, 'addLocation');
            sandbox.stub(vscode.window, 'showQuickPick').resolves('No');
            await handler.createServer(ProtocolStubs.rspState);
            expect(addLocationStub).calledOnceWith('id');
        });

        test('check if selectRSP is called if no context is passed', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.createServer(undefined);
            expect(selectRSP).calledOnceWith(sinon.match.string);
        });

        test('check if runtime method is called if user picks Yes answer without context passed as param', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const downloadRuntimeStub = sandbox.stub(handler, 'downloadRuntime');
            sandbox.stub(vscode.window, 'showQuickPick').resolves('Yes');
            await handler.createServer(undefined);
            expect(downloadRuntimeStub).calledOnceWith('id');
        });

        test('check if addLocation method is called if user picks No answer without context passed as param', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const addLocationStub = sandbox.stub(handler, 'addLocation');
            sandbox.stub(vscode.window, 'showQuickPick').resolves('No');
            await handler.createServer(undefined);
            expect(addLocationStub).calledOnceWith('id');
        });

    });

    suite('addLocation', () => {

        test('calls addLocation from server explorer', async () => {
            sandbox.stub(serverExplorer, 'addLocation').resolves(undefined);
            await handler.addLocation('id');
            expect(serverExplorer.addLocation).calledOnce;
        });

        test('errors if server explorer is not initialized', async () => {
            const nullHandler = new CommandHandler(null);

            try {
                await nullHandler.addLocation('id');
                expect.fail();
            } catch (err) {
                expect(err).equals('Runtime Server Protocol (RSP) Server is starting, please try again later.');
            }
        });

        test('check if selectRSP is called if no rspId is passed as param', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.addLocation(undefined);
            expect(selectRSP).calledOnceWith('Select RSP provider you want to use');
        });

        test('check if addLocation is called with correct rspId if no rspId is passed as param', async () => {
            const addLocationStub = sandbox.stub(serverExplorer, 'addLocation').resolves(undefined);
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'fakeId', label: 'rsp'});
            await handler.addLocation(undefined);
            expect(addLocationStub).calledOnceWith('fakeId');
        });
    });

    suite('serverActions', () => {
        test('check if error thrown if serverexplorer has not been initialized', async () => {
            const nullHandler = new CommandHandler(null);

            try {
                await nullHandler.serverActions(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err.message).equals('Runtime Server Protocol (RSP) Server is starting, please try again later.');
            }
        });

        test('check if selectRSP is called correctly if context passed is undefined', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.serverActions(undefined);
            expect(selectRSP).calledOnceWith('Select RSP provider you want to retrieve servers');
        });

        test('check if selectServer is not called if user does not choose a rsp server', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any);
            await handler.serverActions(undefined);
            expect(selectServerStub).not.called;
        });

        test('check if selectServer is called with right params if user choose a rsp server', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            await handler.serverActions(undefined);
            expect(selectServerStub).calledOnceWith('id', 'Select server you want to retrieve info about');
        });

        test('check if getServerStateById is not called if user does not choose a server', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            const getServerStateStub = sandbox.stub(serverExplorer, 'getServerStateById');
            await handler.serverActions(undefined);
            expect(getServerStateStub).not.called;
        });

        test('check if getServerStateById is called with right params if user choose a server', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            const getServerStateStub = sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            sandbox.stub(handler, 'chooseServerActions' as any).resolves(undefined);
            await handler.serverActions(undefined);
            expect(getServerStateStub).calledOnceWith('id', 'id');
        });

        test('check if getClientByRSP is called if context contains valid value', async () => {
            const getClientStub = sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            sandbox.stub(handler, 'chooseServerActions' as any).resolves(undefined);
            await handler.serverActions(ProtocolStubs.unknownServerState);
            expect(getClientStub).calledOnceWith('id');
        });

        test('check if error is displayed if client has not been initialized for current rsp', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(undefined);

            try {
                await handler.serverActions(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Failed to contact the RSP server id.');
            }
        });

        test('check if chooseServerActions method is called with right param', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const chooseActionStub = sandbox.stub(handler, 'chooseServerActions' as any).resolves(undefined);
            await handler.serverActions(ProtocolStubs.unknownServerState);
            expect(chooseActionStub).calledOnceWith(ProtocolStubs.serverHandle, stubs.client);
        });

        test('check if executeServerAction is not called if no action has been chosen by user', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            sandbox.stub(handler, 'chooseServerActions' as any).resolves(undefined);
            const executeActionStub = sandbox.stub(handler, 'executeServerAction' as any);
            await handler.serverActions(ProtocolStubs.unknownServerState);
            expect(executeActionStub).not.called;
        });

        test('check if correct action is executed after user chose that if doesnt have additional properties', async () => {
            const actionItem = {
                id: 'action',
                label: 'action',
                actionWorkflow: undefined
            };
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            sandbox.stub(handler, 'chooseServerActions' as any).resolves(actionItem);
            const executeActionStub = sandbox.stub(handler, 'executeServerAction' as any).resolves(ProtocolStubs.okStatus);
            await handler.serverActions(ProtocolStubs.unknownServerState);
            expect(executeActionStub).calledOnceWith(actionItem, ProtocolStubs.unknownServerState, stubs.client);
        });
    });

    suite('chooseServerActions', () => {
        let chooseServerActions;
        const serverActionWorkflow: Protocol.ServerActionWorkflow = {
            actionId: 'id',
            actionLabel: 'label',
            actionWorkflow: undefined
        };
        const listResponse: Protocol.ListServerActionResponse = {
            status: ProtocolStubs.okStatus,
            workflows: []
        };

        setup(() => {
            chooseServerActions = Reflect.get(handler, 'chooseServerActions').bind(handler);
        });

        test('check if listServerActions is called correctly', async () => {
            const listServerActions = stubs.outgoing.listServerActions = sandbox.stub().resolves(listResponse);
            await chooseServerActions(ProtocolStubs.serverHandle, stubs.client);
            expect(listServerActions).calledOnceWith(ProtocolStubs.serverHandle);
        });

        test('display message if there are no actions to be displayed', async () => {
            stubs.outgoing.listServerActions = sandbox.stub().resolves(listResponse);
            const infoMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
            await chooseServerActions(ProtocolStubs.serverHandle, stubs.client);
            expect(infoMessageStub).calledOnceWith('there are no additional actions for this server');
        });

        test('check if quickpick is called with right params if there are actions to be displayed', async () => {
            listResponse.workflows = [serverActionWorkflow];
            stubs.outgoing.listServerActions = sandbox.stub().resolves(listResponse);
            const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
            await chooseServerActions(ProtocolStubs.serverHandle, stubs.client);
            expect(quickPickStub).calledOnceWith([{
                label: 'label',
                id: 'id',
                actionWorkflow: undefined
            }], { placeHolder: 'Please choose the action you want to execute.' });
        });
    });

    suite('executeServerAction', () => {
        let executeServerAction;
        let executeServerStub: sinon.SinonStub;
        const response: Protocol.WorkflowResponse = {
            status: ProtocolStubs.okStatus,
            items: undefined,
            jobId: 'id',
            requestId: 1
        };
        const serverActionWorkflow: ServerActionItem = {
            id: 'id',
            label: 'label',
            actionWorkflow: response
        };
        const actionRequest: Protocol.ServerActionRequest = {
            actionId: 'id',
            data: {},
            requestId: null,
            serverId: 'id'
        };

        setup(() => {
            executeServerAction = Reflect.get(handler, 'executeServerAction').bind(handler);
            executeServerStub = stubs.outgoing.executeServerAction = sandbox.stub().resolves(response);
        });

        test('check if executeServerAction method is called with right param', async () => {
            sandbox.stub(handler, 'handleWorkflow' as any).resolves(undefined);
            await executeServerAction(serverActionWorkflow, ProtocolStubs.unknownServerState, stubs.client);
            expect(executeServerStub).calledOnceWith(actionRequest);
        });

        test('check if handleWorkflow is called with right param', async () => {
            const handleWorkflowStub = sandbox.stub(handler, 'handleWorkflow' as any).resolves(undefined);
            await executeServerAction('action', ProtocolStubs.unknownServerState, stubs.client);
            expect(handleWorkflowStub).calledTwice;
        });

        test('check if executeServerAction is not called second time if status returned by handleWorkflow method is undefined', async () => {
            sandbox.stub(handler, 'handleWorkflow' as any).resolves(undefined);
            await executeServerAction('action', ProtocolStubs.unknownServerState, stubs.client);
            expect(executeServerStub).calledOnce;
        });

        test('check if executeServerAction is not called second time if status returned by handleWorkflow method is OK', async () => {
            sandbox.stub(handler, 'handleWorkflow' as any).resolves(ProtocolStubs.okStatus);
            await executeServerAction('action', ProtocolStubs.unknownServerState, stubs.client);
            expect(executeServerStub).calledOnce;
        });

        test('check if executeServerAction is not called second time if status returned by handleWorkflow method is Error', async () => {
            sandbox.stub(handler, 'handleWorkflow' as any).resolves(ProtocolStubs.errorStatus);
            await executeServerAction('action', ProtocolStubs.unknownServerState, stubs.client);
            expect(executeServerStub).calledOnce;
        });

        test('check if executeServerAction is called second time with right params', async () => {
            const actionRequest: Protocol.ServerActionRequest = {
                actionId: 'id',
                data: {},
                requestId: 1,
                serverId: 'id'
            };
            sandbox.stub(handler, 'handleWorkflow' as any).
                    onFirstCall().resolves(ProtocolStubs.infoStatus).
                    onSecondCall().resolves(ProtocolStubs.infoStatus).
                    onThirdCall().resolves(undefined);
            await executeServerAction(serverActionWorkflow, ProtocolStubs.unknownServerState, stubs.client);
            executeServerStub.secondCall.calledWith(actionRequest);
        });

    });

    suite('handleWorkflow', () => {
        let handleWorkflow;
        let workflowResponseManager: WorkflowResponseStrategyManager;
        const infoResponse: Protocol.WorkflowResponse = {
            status: ProtocolStubs.infoStatus,
            items: [],
            jobId: 'id',
            requestId: 1
        };

        setup(() => {
            handleWorkflow = Reflect.get(handler, 'handleWorkflow').bind(handler);
            workflowResponseManager = new WorkflowResponseStrategyManager();
        });

        test('check if Promise resolve if ok status is passed as param', async () => {
            const response: Protocol.WorkflowResponse = {
                status: ProtocolStubs.okStatus,
                items: undefined,
                jobId: 'id',
                requestId: 1
            };

            const result = await handleWorkflow(response);
            expect(result).equals(ProtocolStubs.okStatus);
        });

        test('check if Promise rejects if errorStatus is passed as param', async () => {
            const response: Protocol.WorkflowResponse = {
                status: ProtocolStubs.errorStatus,
                items: undefined,
                jobId: 'id',
                requestId: 1
            };

            try {
                await handleWorkflow(response);
                expect.fail();
            } catch (err) {
                expect(err).equals(ProtocolStubs.errorStatus);
            }

        });

        test('check if getStrategy is not called if the response does not contain any item', async () => {
            const getStrategyStub = sandbox.stub(workflowResponseManager, 'getStrategy');
            await handleWorkflow(infoResponse);
            expect(getStrategyStub).not.called;
        });

        test('check if Promise resolved if info Status is passed as param', async () => {
            const result = await handleWorkflow(infoResponse);
            expect(result).equals(ProtocolStubs.infoStatus);
        });

    });

    suite('editServer', () => {
        let serverJsonResponseStub: sinon.SinonStub;

        test('check if selectRSP is called if no context is passed', async () => {
            const selectRSP = sandbox.stub(handler, 'selectRSP' as any).resolves(undefined);
            await handler.editServer(undefined);
            expect(selectRSP).calledOnceWith(sinon.match.string);
        });

        test('check if selectServer is called if no context is passed', async () => {
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            const selectServerStub = sandbox.stub(handler, 'selectServer' as any).resolves(undefined);
            await handler.editServer(undefined);
            expect(selectServerStub).calledOnceWith('id', 'Select server you want to retrieve info about');
        });

        test('check if editServer called with right context if nothing is passed as param', async () => {
            const editServerStub = sandbox.stub(serverExplorer, 'editServer');
            sandbox.stub(handler, 'selectRSP' as any).resolves({id: 'id', label: 'rsp'});
            sandbox.stub(handler, 'selectServer' as any).resolves('id');
            sandbox.stub(serverExplorer, 'getServerStateById').returns(ProtocolStubs.unknownServerState);
            await handler.editServer(undefined);
            expect(editServerStub).calledOnceWith('id', ProtocolStubs.serverHandle);
        });

        test('errors if server explorer is not initialized', async () => {
            const nullHandler = new CommandHandler(null);

            try {
                await nullHandler.editServer(ProtocolStubs.unknownServerState);
                expect.fail();
            } catch (err) {
                expect(err).equals('Runtime Server Protocol (RSP) Server is starting, please try again later.');
            }
        });

        test('error if RSPClient is undefined', async () => {
            const getClientStub = sandbox.stub(serverExplorer, 'getClientByRSP').returns(undefined);

            try {
                await serverExplorer.editServer('id', ProtocolStubs.serverHandle);
                expect(getClientStub).calledOnce();
                expect.fail();
            } catch (err) {
                expect(err).equals('Unable to contact the RSP server id.');
            }

        });

        test('error if server properties object is undefined', async () => {
            serverJsonResponseStub = stubs.outgoing.getServerAsJson = sandbox.stub().callsFake(() => {
                return undefined;
            });

            try {
                await serverExplorer.editServer('id', ProtocolStubs.serverHandle);
                expect(serverJsonResponseStub).calledOnce();
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not load server properties for server id');
            }

        });

        test('error if serverJson property of server properties object is undefined', async () => {
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: undefined,
                status: ProtocolStubs.okStatus
            };

            serverJsonResponseStub = stubs.outgoing.getServerAsJson = sandbox.stub().callsFake(() => {
                return serverJsonResponse;
            });

            try {
                await serverExplorer.editServer('id', ProtocolStubs.serverHandle);
                expect(serverJsonResponseStub).calledOnce();
                expect.fail();
            } catch (err) {
                expect(err).equals('Could not load server properties for server id');
            }

        });

        test('check showServerJsonResponse is called with right params if no error occurred', async () => {
            const showStub = sandbox.stub(ServerEditorAdapter.getInstance(serverExplorer), 'showServerJsonResponse');
            const serverJsonResponse: Protocol.GetServerJsonResponse = {
                serverHandle: ProtocolStubs.serverHandle,
                serverJson: `{ test: 'test'}`,
                status: ProtocolStubs.okStatus
            };

            serverJsonResponseStub = stubs.outgoing.getServerAsJson = sandbox.stub().callsFake(() => {
                return serverJsonResponse;
            });

            await serverExplorer.editServer('id', ProtocolStubs.serverHandle);
            expect(showStub).calledOnceWith('id', serverJsonResponse);

        });
    });

    suite('selectRSP', () => {

        test('error if no filter is added and map contains only server with stopped state', async () => {
            try {
                const selectRSPWithHandlerInjected = Reflect.get(handler, 'selectRSP').bind(handler);
                await selectRSPWithHandlerInjected('');
                expect.fail();
            } catch (err) {
                expect(err).equals('There are no RSP providers to choose from.');
            }
        });

        test('showQuickPick not called with 1 server if filtering for stopped state', async () => {
            serverExplorer.RSPServersStatus.get('id').state.state = 4;
            const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
            const selectRSPWithHandlerInjected = Reflect.get(handler, 'selectRSP').bind(handler);
            const filter = server => server.state.state === ServerState.STOPPED;
            await selectRSPWithHandlerInjected('test', filter);
            sandbox.assert.notCalled(quickPickStub);

        });

        test('showQuickPick called with 2 server after filtering', async () => {
            serverExplorer.RSPServersStatus.set('id2', ProtocolStubs.rspProperties);
            const unknownServer = {
                label: 'the type',
                id: 'id'
            };
            const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
            const selectRSPWithHandlerInjected = Reflect.get(handler, 'selectRSP').bind(handler);
            const filter = server => server.state.state !== ServerState.STARTING;
            await selectRSPWithHandlerInjected('test', filter);
            expect(quickPickStub).calledOnceWith([unknownServer, unknownServer], { placeHolder: 'test' });
            serverExplorer.RSPServersStatus.delete('id2');

        });
    });

    suite('selectServer', () => {

        test('getServerStatesByRSP called with correct rspId', async () => {
            const getStateStub = sandbox.stub(serverExplorer, 'getServerStatesByRSP');
            const selectServerWithHandlerInjected = Reflect.get(handler, 'selectServer').bind(handler);
            try {
                await selectServerWithHandlerInjected('id', 'test', undefined);
                expect(getStateStub).calledOnceWith('id');
            } catch (err) {

            }

        });

        test('error if filter for STOPPED status is passed but map contains only server with STARTED state', async () => {
            try {
                const selectServerWithHandlerInjected = Reflect.get(handler, 'selectServer').bind(handler);
                const filter = server => server.state.state === ServerState.STOPPED;
                await selectServerWithHandlerInjected('id', '', filter);
                expect.fail();
            } catch (err) {
                expect(err).equals('There are no servers to choose from.');
            }
        });

        test('showQuickPick called with original map if filtering is not passed', async () => {
            serverExplorer.RSPServersStatus.get('id').state.serverStates = [ProtocolStubs.startedServerState];
            const servers = serverExplorer.getServerStatesByRSP('id').map(server => server.server.id);
            const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
            const selectServerWithHandlerInjected = Reflect.get(handler, 'selectServer').bind(handler);
            await selectServerWithHandlerInjected('id', 'test', undefined);
            expect(quickPickStub).calledOnceWith(servers, { placeHolder: 'test' });

        });
    });
});

function givenServerStarted(sandbox: sinon.SinonSandbox, handler: CommandHandler, responseStub = createServerStartedResponse()) {
    return sandbox.stub(handler, 'startServer')
        .resolves(responseStub);
}

function givenDebugTypeIsSupported(sandbox: sinon.SinonSandbox, handler: CommandHandler) {
    const debugInfo: DebugInfo = new DebugInfo(sandbox.stub() as unknown as Protocol.CommandLineDetails);
    sandbox.stub(DebugInfoProvider, 'retrieve').resolves(debugInfo);
    sandbox.stub(handler, 'checkExtension' as any).resolves(undefined);
}

function givenProcessOutput(sandbox: sinon.SinonSandbox, stubs: ClientStubs) {
    stubs.incoming.onServerProcessOutputAppended = sandbox.stub().callsFake((listener: (arg: Protocol.ServerProcessOutput) => void) => {
        // call listeners that's being registered with fake output
        listener({
            server: ProtocolStubs.serverHandle,
            processId: 'papa smurf',
            streamType: 1,
            text: 'Listening for transport dt_socket'
        });
    });

}

function createServerStartedResponse() {
    return {
        status: {
            severity: 2, // STARTED
            plugin: undefined,
            code: undefined,
            message: undefined,
            trace: undefined,
            ok: true
        },
        details: {
            cmdLine: undefined,
            workingDir: undefined,
            envp: undefined,
            properties: {
                ['debug.details.type']: 'java',
                ['debug.details.port']: 'javaPort'
            }
        }
    };
}
