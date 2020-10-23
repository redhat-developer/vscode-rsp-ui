/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import { Protocol, ServerState } from 'rsp-client';
import { DeployableStateNode, RSPProperties, RSPState, ServerStateNode } from '../src/serverExplorer';
import { RSPType } from 'vscode-server-connector-api';

export class ProtocolStubs {

    public static readonly serverType: Protocol.ServerType = {
        id: 'type',
        description: 'a type',
        visibleName: 'the type'
    };

    public static readonly serverHandle: Protocol.ServerHandle = {
        id: 'id',
        type: ProtocolStubs.serverType
    };

    public static readonly serverState: Protocol.ServerState =  {
        server: ProtocolStubs.serverHandle,
        deployableStates: [],
        publishState: 0,
        runMode: ServerState.RUN_MODE_RUN,
        state: 0
    };

    public static readonly serverDebuggingState: ServerStateNode =  {
        server: ProtocolStubs.serverHandle,
        deployableStates: [],
        publishState: 0,
        runMode: ServerState.RUN_MODE_DEBUG,
        state: 2,
        rsp: 'id'
    };

    public static readonly okStatus: Protocol.Status = {
        code: 0,
        message: 'ok',
        severity: 0,
        ok: true,
        plugin: 'unknown',
        trace: ''
    };

    public static readonly infoStatus: Protocol.Status = {
        code: 0,
        message: 'info',
        severity: 1,
        ok: true,
        plugin: 'unknown',
        trace: ''
    };

    public static readonly errorStatus: Protocol.Status = {
        code: 0,
        message: 'Critical Error',
        ok: false,
        plugin: 'plugin',
        severity: 4,
        trace: ''
    };

    public static readonly processOutput: Protocol.ServerProcessOutput = {
        processId: 'process id',
        server: ProtocolStubs.serverHandle,
        streamType: 0,
        text: 'the type'
    };

    public static readonly cmdDetails: Protocol.CommandLineDetails = {
        cmdLine: [''],
        envp: [],
        properties: {},
        workingDir: 'dir'
    };

    public static readonly serverJson: Protocol.GetServerJsonResponse = {
        status: ProtocolStubs.okStatus,
        serverJson: '',
        serverHandle: ProtocolStubs.serverHandle
    };
    
    public static readonly okStartServerResponse: Protocol.StartServerResponse = {
        details: ProtocolStubs.cmdDetails,
        status: ProtocolStubs.okStatus
    };

    public static readonly errorStartServerResponse: Protocol.StartServerResponse = {
        details: ProtocolStubs.cmdDetails,
        status: ProtocolStubs.errorStatus
    };

    public static readonly unknownServerState: ServerStateNode =  {
        server: ProtocolStubs.serverHandle,
        deployableStates: [],
        publishState: ServerState.PUBLISH_STATE_UNKNOWN,
        runMode: ServerState.RUN_MODE_RUN,
        state: ServerState.UNKNOWN,
        rsp: 'id'
    };

    public static readonly startedServerStateProtocol: Protocol.ServerState = {
        deployableStates: [],
        publishState: ServerState.PUBLISH_STATE_UNKNOWN,
        server: ProtocolStubs.serverHandle,
        runMode: ServerState.RUN_MODE_RUN,
        state: ServerState.STARTED
    };

    public static readonly deployableReference: Protocol.DeployableReference = {
        label: 'fake',
        path: 'fakepath'
    };

    public static readonly deployableStateNode: DeployableStateNode = {
        rsp: 'id',
        publishState: ServerState.PUBLISH_STATE_UNKNOWN,
        server: ProtocolStubs.serverHandle,
        state: ServerState.STARTED,
        reference: ProtocolStubs.deployableReference
    };

    public static readonly startedServerState: ServerStateNode = {
        deployableStates: [ProtocolStubs.deployableStateNode],
        publishState: ServerState.PUBLISH_STATE_UNKNOWN,
        server: ProtocolStubs.serverHandle,
        runMode: ServerState.RUN_MODE_RUN,
        state: ServerState.STARTED,
        rsp: 'id'
    };

    public static readonly stoppedServerState: ServerStateNode = {
        deployableStates: [],
        publishState: ServerState.PUBLISH_STATE_UNKNOWN,
        server: ProtocolStubs.serverHandle,
        runMode: ServerState.RUN_MODE_RUN,
        state: ServerState.STOPPED,
        rsp: 'id'
    };

    public static readonly javaCommandLine: Protocol.CommandLineDetails = {
        cmdLine: [],
        workingDir: '',
        envp: [],
        properties: {
            ['debug.details.type']: 'java',
            ['debug.details.port']: 'javaPort'
        }
    };

    public static readonly rspType: RSPType = {
        id: 'id',
        visibilename: 'the type'
    };

    public static readonly rspState: RSPState = {
        serverStates: [ProtocolStubs.startedServerState],
        state: ServerState.UNKNOWN,
        type: ProtocolStubs.rspType
    };

    public static readonly rspProperties: RSPProperties = {
        client: undefined,
        rspserverstderr: undefined,
        rspserverstdout: undefined,
        state: ProtocolStubs.rspState,
        info: undefined
    };

    public static readonly rspStateStarted: RSPState = {
        serverStates: [],
        state: ServerState.STARTED,
        type: ProtocolStubs.rspType
    };

    public static readonly createResponseOK: Protocol.CreateServerResponse = {
        status: ProtocolStubs.okStatus,
        invalidKeys: []
    };

    public static readonly createResponseKO: Protocol.CreateServerResponse = {
        status: ProtocolStubs.errorStatus,
        invalidKeys: []
    };

    public static readonly updateServerResponse: Protocol.UpdateServerResponse = {
        handle: ProtocolStubs.serverHandle,
        validation: ProtocolStubs.createResponseOK,
        serverJson: ProtocolStubs.serverJson
    };

    public static readonly serverStateWithoutHandle: ServerStateNode =  {
        server: undefined,
        deployableStates: [],
        publishState: 0,
        runMode: undefined,
        state: 0,
        rsp: 'id'
    };

}
