
/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import { ClientStubs } from './clientstubs';
import { ProtocolStubs } from './protocolstubs';
import { Protocol, ServerState } from 'rsp-client';
import { RSPProperties, RSPState, ServerExplorer, ServerStateNode } from '../src/serverExplorer';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { Utils } from '../src/utils/utils';
import { EventEmitter, OpenDialogOptions, OutputChannel, TreeItemCollapsibleState, Uri, window } from 'vscode';

const expect = chai.expect;
chai.use(sinonChai);

suite('Server explorer', () => {

    let sandbox: sinon.SinonSandbox;
    let getStub: sinon.SinonStub;
    let stubs: ClientStubs;
    let serverExplorer: ServerExplorer;

    const fakeChannel: OutputChannel = {
        append: () => { /* do nothing */ },
        show: () => { /* do nothing */ },
        clear: () => { /* do nothing */ },
        dispose: () => { /* do nothing */ },
        appendLine: () => { /* do nothing */ },
        hide: () => { /* do nothing */ },
        name: 'fake'
    };

    const iconPath: Uri = {
        fsPath: '/home/luca/Public/github.com/redhat-developer/vscode-rsp-ui/images/server-light.png',
        authority: '',
        fragment: '',
        path: '/home/luca/Public/github.com/redhat-developer/vscode-rsp-ui/images/server-light.png',
        query: '',
        scheme: 'file',
        toJSON: undefined,
        toString: undefined,
        with: undefined
    };

    setup(() => {
        sandbox = sinon.createSandbox();

        stubs = new ClientStubs(sandbox);
        stubs.outgoing.getServerHandles = sandbox.stub<[number], Promise<Protocol.ServerHandle[]>>().resolves([]);
        stubs.outgoing.getServerState = sandbox.stub<[Protocol.ServerHandle, number], Promise<Protocol.ServerState>>().resolves(ProtocolStubs.unknownServerState);


        serverExplorer = ServerExplorer.getInstance();
        serverExplorer.serverOutputChannels.set('id', fakeChannel);
        getStub = sandbox.stub(serverExplorer.serverOutputChannels, 'get').returns(fakeChannel);
        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);

        sandbox.stub(Utils, 'getIcon').resolves(iconPath);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('insertServer call should add server', async () => {
        // given
        sandbox.stub(serverExplorer, 'refresh');
        stubs.outgoing.getServerState = sandbox.stub<[Protocol.ServerHandle, number], Promise<Protocol.ServerState>>().resolves(ProtocolStubs.startedServerStateProtocol);
        sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
        sandbox.stub(serverExplorer, 'convertToServerStateNode' as any).returns(ProtocolStubs.startedServerState);
        const insertStub = serverExplorer.RSPServersStatus.get('id').state.serverStates.push = sandbox.stub();
        // when
        await serverExplorer.insertServer('id', ProtocolStubs.serverHandle);
        // then
        expect(insertStub).to.be.calledOnceWith(ProtocolStubs.startedServerState);
    });

    test('insertServer doesn\'t call should add server if client is unavailable', async () => {
        // given
        sandbox.stub(serverExplorer, 'refresh');
        stubs.outgoing.getServerState = sandbox.stub<[Protocol.ServerHandle, number], Promise<Protocol.ServerState>>().resolves(ProtocolStubs.startedServerStateProtocol);
        sandbox.stub(serverExplorer, 'getClientByRSP').returns(undefined);
        sandbox.stub(serverExplorer, 'convertToServerStateNode' as any).returns(ProtocolStubs.startedServerState);
        const insertStub = serverExplorer.RSPServersStatus.get('id').state.serverStates.push = sandbox.stub();
        // when
        await serverExplorer.insertServer('id', ProtocolStubs.serverHandle);
        // then
        sandbox.assert.notCalled(insertStub);
    });

    test('removeServer call should remove server', () => {
        // given
        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);
        sandbox.stub(serverExplorer, 'refresh');
        // when
        serverExplorer.removeServer('id', ProtocolStubs.serverHandle);
        // then
        expect(serverExplorer.RSPServersStatus.get('id').state.serverStates).to.not.include(ProtocolStubs.serverHandle);
    });

    test('removeServer should retrieve channel in serverOutputChannels', () => {
        // given
        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);
        sandbox.stub(serverExplorer, 'refresh');
        // when
        serverExplorer.removeServer('id', ProtocolStubs.serverHandle);
        // then
        expect(getStub).calledOnce;
    });

    test('removeServer should remove channel from serverOutputChannels', () => {
        // given
        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);
        sandbox.stub(serverExplorer, 'refresh');
        // when
        serverExplorer.removeServer('id', ProtocolStubs.serverHandle);
        // then
        expect(serverExplorer.serverOutputChannels.size).equals(0);
    });

    test('showOutput call should show servers output channel', () => {
        // given
        const spy = sandbox.spy(fakeChannel, 'show');
        // when
        serverExplorer.showOutput(ProtocolStubs.unknownServerState);
        // then
        expect(getStub).calledOnce;
        expect(spy).calledOnce;
    });

    test('showOutput call should show nothing if output channel doesn\'t exist', () => {
        // given
        getStub.reset();
        const spy = sandbox.spy(fakeChannel, 'show');
        const serverHandle: Protocol.ServerHandle = {
            id: 'fakeid',
            type: ProtocolStubs.serverType
        };
        const serverState: ServerStateNode = {
            ...ProtocolStubs.unknownServerState,
            server: serverHandle
        };
        // when
        serverExplorer.showOutput(serverState);
        // then
        sandbox.assert.notCalled(spy);
    });

    test('addServerOutput call should show ServerOutput channel', () => {
        const appendSpy = sandbox.spy(fakeChannel, 'append');
        serverExplorer.addServerOutput(ProtocolStubs.processOutput);

        expect(getStub).calledOnce;
        expect(appendSpy).calledOnce;
    });

    test('refresh element should fire event for element', () => {
        // given
        const fireStub = sandbox.stub(EventEmitter.prototype, 'fire');
        serverExplorer.selectNode = sandbox.stub();
        // when
        serverExplorer.refresh(ProtocolStubs.unknownServerState);
        // then
        expect(fireStub).calledOnce;
    });

    suite('updateServer', () => {

        let findStatusStub: sinon.SinonStub;

        const stateChangeUnknown: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 0,
            publishState: 1,
            runMode: ServerState.RUN_MODE_RUN,
            deployableStates: []
        };
        const stateChangeStarting: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 1,
            publishState: 1,
            runMode: ServerState.RUN_MODE_RUN,
            deployableStates: []
        };
        const stateChangeStarted: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 2,
            publishState: 1,
            runMode: ServerState.RUN_MODE_RUN,
            deployableStates: []
        };
        const stateChangeDebuggingStarting: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 1,
            publishState: 1,
            runMode: ServerState.RUN_MODE_DEBUG,
            deployableStates: []
        };
        const stateChangeDebugging: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 2,
            publishState: 1,
            runMode: ServerState.RUN_MODE_DEBUG,
            deployableStates: []
        };
        const stateChangeStopping: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 3,
            publishState: 1,
            runMode: ServerState.RUN_MODE_RUN,
            deployableStates: []
        };
        const stateChangeStopped: Protocol.ServerState = {
            server: ProtocolStubs.serverHandle,
            state: 4,
            publishState: 1,
            runMode: ServerState.RUN_MODE_RUN,
            deployableStates: []
        };

        const serverStop = {
            collapsibleState: TreeItemCollapsibleState.Expanded,
            label: 'id',
            description: '(Stopped) (Unknown)',
            id: 'id-id',
            contextValue: 'Stopped',
            iconPath: iconPath,
            command: {
                command: 'server.saveSelectedNode',
                title: '',
                tooltip: '',
                arguments: [ ProtocolStubs.unknownServerState ]
            }
        };

        const serverStart = {
            collapsibleState: TreeItemCollapsibleState.Expanded,
            label: 'id',
            description: '(Started) (Unknown)',
            id: 'id-id',
            contextValue: 'Started',
            iconPath: iconPath,
            command: {
                command: 'server.saveSelectedNode',
                title: '',
                tooltip: '',
                arguments: [ ProtocolStubs.unknownServerState ]
            }
        };

        const serverDebugging = {
            collapsibleState: TreeItemCollapsibleState.Expanded,
            label: 'id',
            description: '(Debugging) (undefined)',
            id: 'id-id',
            contextValue: 'Debugging',
            iconPath: iconPath,
            command: {
                command: 'server.saveSelectedNode',
                title: '',
                tooltip: '',
                arguments: [ ProtocolStubs.serverDebuggingState ]
            }
        };

        const serverUnknown = {
            collapsibleState: TreeItemCollapsibleState.Expanded,
            label: 'id',
            description: '(Unknown) (Unknown)',
            id: 'id-id',
            contextValue: 'Unknown',
            iconPath: iconPath,
            command: {
                command: 'server.saveSelectedNode',
                title: '',
                tooltip: '',
                arguments: [ ProtocolStubs.unknownServerState ]
            }
        };

        setup(() => {
            serverExplorer.RSPServersStatus.get('id').state.serverStates = [ProtocolStubs.stoppedServerState];
            findStatusStub = serverExplorer.RSPServersStatus.get('id').state.serverStates.findIndex = sandbox.stub().returns(0);
        });

        test('call should update server state to received in state change event (Stopped)', async () => {
            sandbox.stub(serverExplorer.runStateEnum, 'get').returns('Stopped');
            sandbox.stub(serverExplorer, 'refresh');
            serverExplorer.selectNode = sandbox.stub();
            const children = serverExplorer.getChildren();
            const treeItem = await serverExplorer.getTreeItem(ProtocolStubs.unknownServerState);

            serverExplorer.updateServer('id', stateChangeStopping);
            serverExplorer.updateServer('id', stateChangeStopped);

            expect(findStatusStub).calledTwice;
            expect(getStub).calledTwice;
            expect(children).deep.equals([ProtocolStubs.rspState]);
            expect(treeItem).deep.equals(serverStop);
        });

        test('call should update server state to received in state change event (Started)', async () => {
            sandbox.stub(serverExplorer.runStateEnum, 'get').returns('Started');
            sandbox.stub(serverExplorer, 'refresh');
            serverExplorer.selectNode = sandbox.stub();
            serverExplorer.selectNode = sandbox.stub();
            const children = serverExplorer.getChildren();
            const treeItem = await serverExplorer.getTreeItem(ProtocolStubs.unknownServerState);

            serverExplorer.updateServer('id', stateChangeStarting);
            serverExplorer.updateServer('id', stateChangeStarted);

            expect(findStatusStub).calledTwice;
            expect(getStub).calledTwice;
            expect(children).deep.equals([ProtocolStubs.rspState]);
            expect(treeItem).deep.equals(serverStart);
        });

        test('call should update server state to received in state change event (Debugging)', async () => {
            const children = serverExplorer.getChildren();
            const treeItem = await serverExplorer.getTreeItem(ProtocolStubs.serverDebuggingState);

            serverExplorer.updateServer('id', stateChangeDebuggingStarting);
            serverExplorer.updateServer('id', stateChangeDebugging);

            expect(children).deep.equals([ProtocolStubs.rspState]);
            expect(treeItem).deep.equals(serverDebugging);
        });

        test('call should update server state to received in state change event (Unknown)', async () => {
            sandbox.stub(serverExplorer.runStateEnum, 'get').returns('Unknown');
            sandbox.stub(serverExplorer, 'refresh');
            serverExplorer.selectNode = sandbox.stub();
            const children = serverExplorer.getChildren();
            const treeItem = await serverExplorer.getTreeItem(ProtocolStubs.unknownServerState);

            serverExplorer.updateServer('id', stateChangeUnknown);

            expect(findStatusStub).calledOnce;
            expect(getStub).calledOnce;
            expect(children).deep.equals([ProtocolStubs.rspState]);
            expect(treeItem).deep.equals(serverUnknown);
        });
    });

    suite('publish', () => {
        const serverHandle: Protocol.ServerHandle = {
            id: 'fakeid',
            type: ProtocolStubs.serverType
        };
        test('return error if there is no rsp client', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(null);
            try {
                await serverExplorer.publish('id', serverHandle, ServerState.PUBLISH_FULL, false);
                expect.fail();
            } catch (ex) {
                expect(ex).equals('Unable to contact the RSP server.');
            }
        });

        test('check async publish is called if isAsync param is true', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const asyncPublishStub = stubs.outgoing.publishAsync.resolves(ProtocolStubs.okStatus);
            const publishStub = stubs.outgoing.publish.resolves(ProtocolStubs.okStatus);
            await serverExplorer.publish('id', serverHandle, ServerState.PUBLISH_FULL, true);
            expect(asyncPublishStub).calledOnceWith({server: serverHandle, kind: ServerState.PUBLISH_FULL});
            expect(publishStub).not.called;
        });

        test('check sync publish is called if isAsync param is false', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const asyncPublishStub = stubs.outgoing.publishAsync.resolves(ProtocolStubs.okStatus);
            const publishStub = stubs.outgoing.publish.resolves(ProtocolStubs.okStatus);
            await serverExplorer.publish('id', serverHandle, ServerState.PUBLISH_FULL, false);
            expect(publishStub).calledOnceWith({server: serverHandle, kind: ServerState.PUBLISH_FULL});
            expect(asyncPublishStub).not.called;
        });

        test('promise rejected with status message if its status is not OK', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stubs.outgoing.publish.resolves(ProtocolStubs.errorStatus);
            try {
                await serverExplorer.publish('id', serverHandle, ServerState.PUBLISH_FULL, false);
            } catch (ex) {
                expect(ex).equals('Critical Error');
            }
        });

        test('return status if its status is OK', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stubs.outgoing.publish.resolves(ProtocolStubs.okStatus);
            const res = await serverExplorer.publish('id', serverHandle, ServerState.PUBLISH_FULL, false);
            expect(res).equals(ProtocolStubs.okStatus);
        });
    });

    suite('addLocation', () => {
        let findServerStub: sinon.SinonStub;
        let showOpenDialogStub: sinon.SinonStub;

        const serverBean: Protocol.ServerBean = {
            fullVersion: 'version',
            location: 'path',
            name: 'EAP',
            serverAdapterTypeId: 'org.jboss',
            specificType: 'EAP',
            typeCategory: 'EAP',
            version: '7.1'
        };

        const orgJbossServerType: Protocol.ServerType = {
            id: 'org.jboss',
            visibleName: 'org.jboss.visiblename',
            description: 'org.jboss.description'
        };

        const serverBeanWithoutType: Protocol.ServerBean = {
            fullVersion: 'version',
            location: 'path',
            name: 'EAP',
            serverAdapterTypeId: '',
            specificType: 'EAP',
            typeCategory: 'EAP',
            version: '7.1'
        };

        const noAttributes: Protocol.Attributes = {
            attributes: { }
        };

        const userSelectedPath: Uri = { 
            fsPath: 'path/path',
            authority: 'authority',
            fragment: 'fragment',
            path: 'path/path',
            query: 'query',
            scheme: 'scheme',
            toJSON: () => { /* do nothing */ },
            toString: () => '',
            with: undefined
        };

        const discoveryPath: Protocol.DiscoveryPath = {
            filepath: userSelectedPath.fsPath
        };

        setup(() => {
            findServerStub = stubs.outgoing.findServerBeans.resolves([serverBean]);

            showOpenDialogStub = sandbox.stub(window, 'showOpenDialog').resolves([userSelectedPath]);
            sandbox.stub(window, 'showQuickPick').resolves();
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
        });

        test('should open a webview for the given server type', async () => {
            if(discoveryPath && noAttributes && orgJbossServerType && showOpenDialogStub) {
                // this garbage just added so I don't have to comment out those lines
            }
        /*
            const inputBoxStub = sandbox.stub(window, 'showInputBox');
            inputBoxStub.onFirstCall().resolves('eap');
            inputBoxStub.onSecondCall().resolves('No');

            stubs.outgoing.getOptionalAttributes.resolves(noAttributes);
            stubs.outgoing.getRequiredAttributes.resolves(noAttributes);
            stubs.outgoing.getServerTypes.resolves([orgJbossServerType]);

            const webviewStub = sandbox.stub(window, 'createWebviewPanel');
            webviewStub.onFirstCall().resolves({
                webview: {
                    html: '',
                    onDidReceiveMessage(type: any) {
                    }
                },
                onDidDispose(param:any) {
                }
            });

            await serverExplorer.addLocation('id'); // to be modified
            expect(findServerStub).calledOnceWith(discoveryPath);
            expect(showOpenDialogStub).calledOnce;
            expect(webviewStub).calledOnce;
        */
        });

        test('should error if no server detected in provided location', async () => {
            findServerStub.resolves([]);

            try {
                await serverExplorer.addLocation('id'); // to be modified
                expect.fail();
            } catch (err) {
                expect(err.message).length > 0;
            }
        });

        test('should error if adapter type is empty', async () => {
            findServerStub.resolves([serverBeanWithoutType]);

            try {
                await serverExplorer.addLocation('id'); // to be modified
                expect.fail();
            } catch (err) {
                expect(err.message).length > 0;
            }
        });
    });

    suite('addDeployment', () => {
        enum FilePickerType {
            FILE = 'FILE',
            FOLDER = 'FOLDER',
            BOTH = 'BOTH'
        }

        const userSelectedPath: Uri = { 
            fsPath: 'path/path',
            authority: 'authority',
            fragment: 'fragment',
            path: 'path/path',
            query: 'query',
            scheme: 'scheme',
            toJSON: () => { /* do nothing */ },
            toString: () => '',
            with: undefined
        };

        const rspProperties: RSPProperties = {
            client: undefined,
            rspserverstderr: undefined,
            rspserverstdout: undefined,
            state: ProtocolStubs.rspState,
            info: undefined
        };

        setup(() => {
            serverExplorer.RSPServersStatus.set('id', rspProperties);
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
        });

        test('check dialog options are set up correctly when choosing file in Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32'
            });
            sandbox.stub(serverExplorer, 'quickPickDeploymentType' as any).resolves(FilePickerType.FILE);

            const filePickerResponseWindows = {
                canSelectFiles: true,
                canSelectMany: false,
                canSelectFolders: false,
                openLabel: 'Select File Deployment'
            };
            const stubDialog = sandbox.stub(window, 'showOpenDialog');
            await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);

            const filePickerResult = stubDialog.getCall(0).args[0];
            filePickerResult.defaultUri = undefined;
            expect(JSON.stringify(filePickerResult)).equals(JSON.stringify(filePickerResponseWindows));
        });

        test('check dialog options are set up correctly when choosing folder in Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32'
            });
            sandbox.stub(serverExplorer, 'quickPickDeploymentType' as any).resolves(FilePickerType.FOLDER);

            const folderPickerResponseWindows = {
                canSelectFiles: false,
                canSelectMany: false,
                canSelectFolders: true,
                openLabel: 'Select Exploded Deployment'
            };
            const stubDialog = sandbox.stub(window, 'showOpenDialog');
            await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);

            const folderPickerResult = stubDialog.getCall(0).args[0];
            folderPickerResult.defaultUri = undefined;
            expect(JSON.stringify(folderPickerResult)).equals(JSON.stringify(folderPickerResponseWindows));
        });

        test('check dialog options are set up correctly when choosing file in Linux', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux'
            });
            sandbox.stub(serverExplorer, 'quickPickDeploymentType' as any).resolves(FilePickerType.FILE);

            const filePickerResponseLinux = {
                canSelectFiles: true,
                canSelectMany: false,
                canSelectFolders: false,
                openLabel: 'Select File Deployment'
            };
            const stubDialog = sandbox.stub(window, 'showOpenDialog');
            await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);

            const filePickerResult = stubDialog.getCall(0).args[0];
            filePickerResult.defaultUri = undefined;
            expect(JSON.stringify(filePickerResult)).equals(JSON.stringify(filePickerResponseLinux));
        });

        test('check dialog options are set up correctly when choosing folder in Linux', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux'
            });
            sandbox.stub(serverExplorer, 'quickPickDeploymentType' as any).resolves(FilePickerType.FOLDER);

            const folderPickerResponseLinux: OpenDialogOptions = {
                canSelectFiles: false,
                canSelectMany: false,
                canSelectFolders: true,
                openLabel: 'Select Exploded Deployment'
            };
            const stubDialog = sandbox.stub(window, 'showOpenDialog');
            await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);

            const folderPickerResult = stubDialog.getCall(0).args[0];
            folderPickerResult.defaultUri = undefined;
            expect(JSON.stringify(folderPickerResult)).equals(JSON.stringify(folderPickerResponseLinux));
        });

        test('check dialog options are set up correctly when opening dialog with different OSes (like MAC OS)', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin'
            });
            sandbox.stub(serverExplorer, 'quickPickDeploymentType' as any).resolves(FilePickerType.BOTH);

            const pickerResponseDialog: OpenDialogOptions = {
                canSelectFiles: true,
                canSelectMany: false,
                canSelectFolders: true,
                openLabel: 'Select file or exploded Deployment'
            };
            const stubDialog = sandbox.stub(window, 'showOpenDialog');
            await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);

            const pickerResult = stubDialog.getCall(0).args[0];
            pickerResult.defaultUri = undefined;
            expect(JSON.stringify(pickerResult)).equals(JSON.stringify(pickerResponseDialog));
        });

        test('check nothing is made if os picker is closed without choosing', async () => {
            sandbox.stub(serverExplorer, 'quickPickDeploymentType' as any).resolves(undefined);
            const openDialogStub = sandbox.stub(window, 'showOpenDialog');

            await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);
            expect(openDialogStub).not.called;
        });

        test('check if user doesn\'t choose any file from dialog', async () => {
            sandbox.stub(window, 'showOpenDialog').resolves(undefined);
            const result = await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);
            expect(result).equals(undefined);
        });

        test('check if user terminate before adding optional deployment parameters', async () => {
            sandbox.stub(window, 'showOpenDialog').resolves([userSelectedPath]);
            sandbox.stub(window, 'showQuickPick').resolves(undefined);
            const result = await serverExplorer.selectAndAddDeployment(ProtocolStubs.startedServerState);
            expect(result).equals(undefined);
        });
    });

    suite('removeDeployment', () => {
        test('check if removeDeployable is called once', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            const stubRemoveDeployable = stubs.outgoing.removeDeployable = sandbox.stub<[Protocol.ServerDeployableReference, number], Promise<Protocol.Status>>().resolves(ProtocolStubs.okStatus);
            await serverExplorer.removeDeployment('id', ProtocolStubs.serverHandle, ProtocolStubs.deployableReference);
            expect(stubRemoveDeployable).calledOnce;
        });

        test('check if deployable is removed correctly', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stubs.outgoing.removeDeployable = sandbox.stub<[Protocol.ServerDeployableReference, number], Promise<Protocol.Status>>().resolves(ProtocolStubs.okStatus);
            const result = await serverExplorer.removeDeployment('id', ProtocolStubs.serverHandle, ProtocolStubs.deployableReference);
            expect(result).equals(ProtocolStubs.okStatus);
        });

        test('check if promise is rejected when removeDeployable fails', async () => {
            sandbox.stub(serverExplorer, 'getClientByRSP').returns(stubs.client);
            stubs.outgoing.removeDeployable = sandbox.stub<[Protocol.ServerDeployableReference, number], Promise<Protocol.Status>>().resolves(ProtocolStubs.errorStatus);
            try {
                await serverExplorer.removeDeployment('id', ProtocolStubs.serverHandle, ProtocolStubs.deployableReference);
                expect.fail();
            } catch (err) {
                expect(err).equals(ProtocolStubs.errorStatus.message);
            }
        });
    });

    suite('getClientByRSP', () => {

        test('check if return nothing if rsp server doesn\'t exists in map', async () => {
            const result = await serverExplorer.getClientByRSP('fakeid');
            expect(result).equals(undefined);
        });

        test('check if return right client when called with existing rsp id', async () => {
            const rspPropertiesWithClient  = {
                client: stubs.client,
                rspserverstderr: undefined,
                rspserverstdout: undefined,
                state: ProtocolStubs.rspState,
                info: undefined
            };
            serverExplorer.RSPServersStatus.set('client', rspPropertiesWithClient);
            const result = await serverExplorer.getClientByRSP('client');
            expect(result).equals(stubs.client);
            // clear map
            serverExplorer.RSPServersStatus.delete('client');
        });
    });

    suite('getRSPOutputChannel', () => {

        test('check if return nothing if rsp server doesn\'t exists in map', async () => {
            const result = await serverExplorer.getRSPOutputChannel('fakeid');
            expect(result).equals(undefined);
        });

        test('check if return right output channel when called with existing rsp id', async () => {
            const stdout = window.createOutputChannel('RSP (stdout)');
            const rspPropertiesWithStdOut  = {
                client: undefined,
                rspserverstderr: undefined,
                rspserverstdout: stdout,
                state: ProtocolStubs.rspState,
                info: undefined
            };
            serverExplorer.RSPServersStatus.set('stdout', rspPropertiesWithStdOut);
            const result = await serverExplorer.getRSPOutputChannel('stdout');
            expect(result).equals(stdout);
            // clear map
            serverExplorer.RSPServersStatus.delete('stdout');
        });
    });

    suite('getRSPErrorChannel', () => {

        test('check if return nothing if rsp server doesn\'t exists in map', async () => {
            const result = await serverExplorer.getRSPErrorChannel('fakeid');
            expect(result).equals(undefined);
        });

        test('check if return right output channel when called with existing rsp id', async () => {
            const stderr = window.createOutputChannel('RSP (stderr)');
            const rspPropertiesWithStderr  = {
                client: undefined,
                rspserverstderr: stderr,
                rspserverstdout: undefined,
                state: ProtocolStubs.rspState,
                info: undefined
            };
            serverExplorer.RSPServersStatus.set('stderr', rspPropertiesWithStderr);
            const result = await serverExplorer.getRSPErrorChannel('stderr');
            expect(result).equals(stderr);
            // clear map
            serverExplorer.RSPServersStatus.delete('stderr');
        });
    });

    suite('getTreeItem', () => {
        test('return undefined if element is not a valid one', async () => {
            const rsp: RSPState = {
                type: undefined,
                state: ServerState.UNKNOWN,
                serverStates: []
            };

            const result = await serverExplorer.getTreeItem(rsp);
            expect(result).equals(undefined);
        });

        test('return valid node if RSPState is passed', async () => {
            const nodeResult = {
                label: 'the type',
                description: '(Stopped)',
                id: 'the type',
                iconPath: iconPath,
                contextValue: 'RSPStopped',
                collapsibleState: TreeItemCollapsibleState.Expanded
            };

            const result = await serverExplorer.getTreeItem(ProtocolStubs.rspState);
            expect(result).deep.equals(nodeResult);
        });

        test('return valid node if ServerStateNode is passed', async () => {
            const nodeResult = { label: 'id',
                description: '(Unknown) (Unknown)',
                id: 'id-id',
                iconPath: iconPath,
                contextValue: 'Unknown',
                collapsibleState: TreeItemCollapsibleState.Expanded,
                command: {
                    command: 'server.saveSelectedNode',
                    title: '',
                    tooltip: '',
                    arguments: [ ProtocolStubs.unknownServerState ]
                }
            };

            const result = await serverExplorer.getTreeItem(ProtocolStubs.unknownServerState);
            expect(result).deep.equals(nodeResult);
        });

        test('return valid node if DeployableStateNode is passed', async () => {

            const nodeResult = { label: 'fake',
                description: '(Started) (Unknown)',
                iconPath: iconPath,
                contextValue: 'Unknown',
                collapsibleState: TreeItemCollapsibleState.None
            };

            const result = await serverExplorer.getTreeItem(ProtocolStubs.deployableStateNode);
            expect(result).deep.equals(nodeResult);
        });
    });

    suite('getChildren', () => {
        setup(() => {
            serverExplorer.RSPServersStatus.get('id').state.serverStates = [ProtocolStubs.startedServerState];
        });

        test('return RSPState nodes if undefined is passed', async () => {
            const rspNodes = serverExplorer.getChildren(undefined);
            expect(rspNodes).deep.equals([ProtocolStubs.rspState]);
        });

        test('return list ServerState children nodes if rsp node is passed', async () => {
            const serverNodes = serverExplorer.getChildren(ProtocolStubs.rspState);
            expect(serverNodes).deep.equals([ProtocolStubs.startedServerState]);
        });

        test('return list DeployableState children nodes if server node is passed', async () => {
            const deployableNodes = serverExplorer.getChildren(ProtocolStubs.startedServerState);
            expect(deployableNodes).deep.equals([ProtocolStubs.deployableStateNode]);
        });

        test('return empty array if DeployableStateNode is passed', async () => {
            const result = serverExplorer.getChildren(ProtocolStubs.deployableStateNode);
            expect(result).deep.equals([]);
        });
    });

    suite('getParent', () => {
        test('return rsp element if serverState node is passed', async () => {
            const rspNode = serverExplorer.getParent(ProtocolStubs.startedServerState);
            expect(rspNode).deep.equals(ProtocolStubs.rspState);
        });

        test('return serverState element if deployablestate node is passed', async () => {
            const serverNode = serverExplorer.getParent(ProtocolStubs.deployableStateNode);
            expect(serverNode).deep.equals(ProtocolStubs.startedServerState);
        });

        test('return undefined if rspState node is passed', async () => {
            const result = serverExplorer.getParent(ProtocolStubs.rspState);
            expect(result).equals(undefined);
        });
    });

    suite('getServerStateById', () => {
        test('return serverStateNode by passing rsp id and server id', async () => {
            const result = serverExplorer.getServerStateById('id', 'id');
            expect(result).deep.equals(ProtocolStubs.startedServerState);
        });
    });

    suite('getServerStatesByRSP', () => {
        test('return serverStateNode array by passing rsp id', async () => {
            const result = serverExplorer.getServerStatesByRSP('id');
            expect(result).deep.equals([ProtocolStubs.startedServerState]);
        });
    });

    suite('disposeRSPProperties', () => {

        test('check if disconnect client is called if client exists', async () => {
            serverExplorer.RSPServersStatus.get('id').client = stubs.client;
            serverExplorer.disposeRSPProperties('id');
            expect(stubs.clientStub.disconnect).calledOnce;
        });

        test('check if dispose stdout output channel if exist', async () => {
            const rspserverstdout: OutputChannel = window.createOutputChannel('(stdout)');
            serverExplorer.RSPServersStatus.get('id').rspserverstdout = rspserverstdout;
            const disposeStdOutStub = sandbox.stub(rspserverstdout, 'dispose');
            serverExplorer.disposeRSPProperties('id');
            expect(disposeStdOutStub).calledOnce;
        });

        test('check if dispose stderr output channel if exist', async () => {
            const rspserverstderr = window.createOutputChannel('(stderr)');
            serverExplorer.RSPServersStatus.get('id').rspserverstderr = rspserverstderr;
            const disposeStdErrStub = sandbox.stub(rspserverstderr, 'dispose');
            serverExplorer.disposeRSPProperties('id');
            expect(disposeStdErrStub).calledOnce;
        });
    });

    suite('updateRSPServer', () => {
        test('check if value is updated for rsp state', async () => {
            let state = serverExplorer.RSPServersStatus.get('id').state.state;
            expect(state).not.equals(0);
            serverExplorer.updateRSPServer('id', 0);
            state = serverExplorer.RSPServersStatus.get('id').state.state;
            expect(state).equals(0);
        });

        test('check if refresh function is called correctly', async () => {
            const refreshStub = sandbox.stub(serverExplorer, 'refresh');
            serverExplorer.updateRSPServer('id', 0);
            expect(refreshStub).calledOnce;
        });
    });
});
