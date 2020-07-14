/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as chai from 'chai';
import { ClientStubs } from './clientstubs';
import { activate, deactivate } from '../src/extension';
import { ProtocolStubs } from './protocolstubs';
import { Protocol } from 'rsp-client';
import { RSPProperties, ServerExplorer } from '../src/serverExplorer';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as vscode from 'vscode';

const expect = chai.expect;
chai.use(sinonChai);

// Defines a Mocha test suite to group tests of similar kind together
suite('Extension Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let stubs: ClientStubs;
    let serverExplorer: ServerExplorer;

    class DummyMemento implements vscode.Memento {
        public get<T>(key: string): Promise<T|undefined> {
            return Promise.resolve(undefined);
        }

        public update(key: string, value: any): Promise<void> {
            return Promise.resolve();
        }
    }

    const context: vscode.ExtensionContext = {
        extensionPath: 'path',
        storagePath: 'string',
        subscriptions: [],
        workspaceState: new DummyMemento(),
        globalState: new DummyMemento(),
        asAbsolutePath(relativePath: string): string {
            return '';
        },
        logPath: '',
        globalStoragePath: ''
    };

    setup(() => {
        sandbox = sinon.createSandbox();

        stubs = new ClientStubs(sandbox);
        stubs.outgoing.getServerHandles.resolves([]);
        const capab: Protocol.ServerCapabilitiesResponse = {
            serverCapabilities: {
            },
            clientRegistrationStatus: undefined
        };
        stubs.outgoing.registerClientCapabilities.resolves(capab);
        stubs.incoming.onPromptString.resolves();

        serverExplorer = ServerExplorer.getInstance();
        serverExplorer.RSPServersStatus.set('id', ProtocolStubs.rspProperties);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('redhat.vscode-rsp-ui'));
    });

    test('Server is started at extension activation time', async () => {
        const serverInstance = sandbox.stub(ServerExplorer, 'getInstance').returns(serverExplorer);
        sandbox.stub(vscode.commands, 'registerCommand').resolves();
        await activate(context);
        expect(serverInstance).calledOnce;
    });

    test('should register all server commands', async () => {
        return await vscode.commands.getCommands(true).then(commands => {
            const SERVER_COMMANDS = [
                'server.startRSP',
                'server.stopRSP',
		'server.disconnectRSP',
                'server.terminateRSP',
                'server.start',
                'server.restart',
                'server.debug',
                'server.restartDebug',
                'server.stop',
                'server.terminate',
                'server.remove',
                'server.output',
                `server.addDeployment`,
                'server.removeDeployment',
                'server.publishFull',
                'server.publishIncremental',
                'server.createServer',
                'server.addLocation',
                'server.downloadRuntime',
                'server.actions',
                'server.editServer',
                'server.application.run',
                'server.application.debug',
                'server.saveSelectedNode'
            ];
            const foundServerCommands = commands.filter(value => {
                return SERVER_COMMANDS.indexOf(value) >= 0 || value.startsWith('server.');
            });
            const t1 = foundServerCommands.length;
            const t2 = SERVER_COMMANDS.length;
            assert.equal(t1, t2,
                'Some server commands are not registered properly or a new command is not added to the test');
        });
    });

    test('deactivation if rsp server doesnt have rsp client defined', () => {
        serverExplorer.RSPServersStatus.get('id').client = undefined;
        deactivate();

        sandbox.assert.notCalled(stubs.clientStub.shutdownServer);
    });

    test('RSP has been stopped on deactivation if spawned here', () => {
        const rspProperties: RSPProperties = {
            client: stubs.client,
            rspserverstderr: undefined,
            rspserverstdout: undefined,
            state: ProtocolStubs.rspState,
            info: {
                host: "localhost",
                port: 12345,
                spawned: true
            }
        };
        serverExplorer.RSPServersStatus.set('id', rspProperties);
        deactivate();

        expect(stubs.clientStub.shutdownServer).calledOnce;
    });

    test('RSP has been stopped on disconnected if NOT spawned here', () => {
        const rspProperties: RSPProperties = {
            client: stubs.client,
            rspserverstderr: undefined,
            rspserverstdout: undefined,
            state: ProtocolStubs.rspState,
            info: {
                host: "localhost",
                port: 12345,
                spawned: false
            }
        };
        serverExplorer.RSPServersStatus.set('id', rspProperties);
        deactivate();

        expect(stubs.clientStub.disconnect).calledOnce;
    });
});
