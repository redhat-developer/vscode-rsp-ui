// The module 'assert' provides assertion methods from node
import * as chai from 'chai';
import { initClient } from '../../src/rsp/client';
import { ClientStubs } from '../clientstubs';
import { JobProgress } from '../../src/jobprogress';
import { Protocol, RSPClient } from 'rsp-client';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { ServerInfo } from 'vscode-server-connector-api';

const expect = chai.expect;
chai.use(sinonChai);

// Defines a Mocha test suite to group tests of similar kind together
suite('Client Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let stubs: ClientStubs;
    const serverInfo: ServerInfo = {
        host: 'localhost',
        port: 8080
    };

    setup(() => {
        sandbox = sinon.createSandbox();

        stubs = new ClientStubs(sandbox);
        stubs.outgoing.getServerHandles.resolves([]);
        stubs.incoming.onPromptString.resolves();

    });

    teardown(() => {
        sandbox.restore();
    });

    test('initClient - check if rspclient connect is called', async () => {
        const stubClientConnect = stubs.client.connect = sandbox.stub().resolves();
        await initClient(serverInfo);
        expect(stubClientConnect).calledOnce;
    });

    test('initClient - check if rspclient onPromptString is called', async () => {
        const stubPrompt = stubs.incoming.onPromptString = sandbox.stub<[(arg: Protocol.StringPrompt) => Promise<string>], void>().resolves();
        await initClient(serverInfo);
        expect(stubPrompt).calledOnce;
    });

    test('initClient - check if rspclient registerClientCapabilities is called', async () => {
        const stubCapabilities = stubs.outgoing.registerClientCapabilities = sandbox.stub<[Protocol.ClientCapabilitiesRequest, number], Promise<Protocol.ServerCapabilitiesResponse>>().resolves();
        await initClient(serverInfo);
        expect(stubCapabilities).calledOnce;
    });

    test('initClient - check if jobprogress is called with current client', async () => {
        const rspClient = new RSPClient(serverInfo.host, serverInfo.port);
        const stubJobProgress = sandbox.stub(JobProgress, 'create');
        await initClient(serverInfo);
        expect(stubJobProgress).to.be.calledOnceWith(rspClient);
    });

});
