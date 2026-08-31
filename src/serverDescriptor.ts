/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';

import { Protocol, RSPClient, StatusSeverity } from 'rsp-client';
import { ServerExplorer } from './serverExplorer';
import * as vscode from 'vscode';

const VARIABLE_PREFIX = '${rsp_import_export/';
const VARIABLE_SUFFIX = '}';
const FORMAT_VERSION_KEY = 'rsp.descriptor.format.version';
const FORMAT_VERSION = '1.0';
const TYPE_ID_KEY = 'org.jboss.tools.rsp.server.typeId';
const EXCLUDED_EXPORT_KEYS = new Set(['id', 'deployables']);

function isFilesystemPath(value: string): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    const trimmed = value.trim();

    if (trimmed.startsWith('file://')) return true;

    if (trimmed.startsWith('/')) {
        const segments = trimmed.split('/').filter(s => s.length > 0);
        return segments.length >= 2;
    }

    if (/^[A-Za-z]:[\\\/]/.test(trimmed)) return true;

    return false;
}

function detectPathAttributes(attrs: Record<string, any>): Map<string, string> {
    const pathAttrs = new Map<string, string>();
    for (const [key, value] of Object.entries(attrs)) {
        if (EXCLUDED_EXPORT_KEYS.has(key) || key === FORMAT_VERSION_KEY || key === TYPE_ID_KEY) continue;
        if (typeof value === 'string' && isFilesystemPath(value)) {
            pathAttrs.set(key, value);
        }
    }
    return pathAttrs;
}

function substitutePathsForExport(attrs: Record<string, any>): Record<string, any> {
    const pathAttrs = detectPathAttributes(attrs);

    const sortedPaths = [...pathAttrs.entries()]
        .sort((a, b) => b[1].length - a[1].length);

    const result: Record<string, any> = {};
    result[FORMAT_VERSION_KEY] = FORMAT_VERSION;

    for (const [key, value] of Object.entries(attrs)) {
        if (EXCLUDED_EXPORT_KEYS.has(key)) continue;

        if (typeof value !== 'string') {
            result[key] = value;
            continue;
        }

        let newValue = value;
        for (const [pathKey, pathValue] of sortedPaths) {
            const variable = `${VARIABLE_PREFIX}${pathKey}${VARIABLE_SUFFIX}`;
            while (newValue.includes(pathValue)) {
                newValue = newValue.split(pathValue).join(variable);
            }
        }
        result[key] = newValue;
    }

    return result;
}

function findVariables(attrs: Record<string, any>): string[] {
    const variables = new Set<string>();
    const regex = /\$\{rsp_import_export\/([^}]+)\}/g;

    for (const value of Object.values(attrs)) {
        if (typeof value !== 'string') continue;
        let match;
        while ((match = regex.exec(value)) !== null) {
            variables.add(match[1]);
        }
        regex.lastIndex = 0;
    }
    return [...variables];
}

function resolveVariables(attrs: Record<string, any>, values: Map<string, string>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(attrs)) {
        if (key === FORMAT_VERSION_KEY) continue;

        if (typeof value !== 'string') {
            result[key] = value;
            continue;
        }

        let newValue = value;
        for (const [varKey, varValue] of values.entries()) {
            const variable = `${VARIABLE_PREFIX}${varKey}${VARIABLE_SUFFIX}`;
            while (newValue.includes(variable)) {
                newValue = newValue.split(variable).join(varValue);
            }
        }
        result[key] = newValue;
    }

    return result;
}

export async function exportServerDescriptor(
    rspId: string,
    server: Protocol.ServerHandle,
    client: RSPClient
): Promise<void> {
    const serverJson = await client.getOutgoingHandler().getServerAsJson(server);
    if (!serverJson || !serverJson.serverJson) {
        throw new Error(`Could not retrieve server properties for ${server.id}`);
    }

    const attrs = JSON.parse(serverJson.serverJson);
    const exported = substitutePathsForExport(attrs);
    const content = JSON.stringify(exported, null, 2);

    const defaultName = server.id.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const workspaceFolder = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
        ? vscode.workspace.workspaceFolders[0].uri
        : undefined;
    const defaultUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder, `${defaultName}.server.json`)
        : vscode.Uri.file(`${defaultName}.server.json`);

    const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'RSP Server Descriptor': ['json'] },
        title: 'Export Server Descriptor'
    });

    if (!uri) return;

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    vscode.window.showInformationMessage(`Server descriptor exported to ${uri.fsPath}`);
}

export async function importServerDescriptor(
    rspId: string,
    client: RSPClient,
    explorer: ServerExplorer
): Promise<Protocol.CreateServerResponse | undefined> {
    const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'RSP Server Descriptor': ['json'] },
        title: 'Select Server Descriptor File'
    });

    if (!files || files.length === 0) return;

    const fileContent = await vscode.workspace.fs.readFile(files[0]);
    const attrs: Record<string, any> = JSON.parse(Buffer.from(fileContent).toString('utf-8'));

    const serverTypeId = attrs[TYPE_ID_KEY];
    if (!serverTypeId) {
        throw new Error('Descriptor file does not contain a server type ID (org.jboss.tools.rsp.server.typeId)');
    }

    const serverTypes = await client.getOutgoingHandler().getServerTypes();
    const serverType = serverTypes.find(t => t.id === serverTypeId);
    if (!serverType) {
        throw new Error(
            `This RSP does not support server type "${serverTypeId}". ` +
            'Make sure you are importing to the correct RSP provider.'
        );
    }

    const variables = findVariables(attrs);
    const variableValues = new Map<string, string>();

    for (const varKey of variables) {
        const isFileKey = /\.file\b/i.test(varKey) && !/\.dir\b/i.test(varKey);
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: isFileKey,
            canSelectFolders: !isFileKey,
            canSelectMany: false,
            title: `Select path for: ${varKey}`,
            openLabel: `Select (${varKey})`
        });

        if (!result || result.length === 0) return;
        variableValues.set(varKey, result[0].fsPath);
    }

    const resolved = resolveVariables(attrs, variableValues);

    const defaultName = explorer.getDefaultServerName(rspId, serverType);
    const serverName = await vscode.window.showInputBox({
        prompt: `Enter a name for the new ${serverType.visibleName} server`,
        value: defaultName,
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Server name cannot be empty';
            }
            const existing = explorer.getServerStatesByRSP(rspId);
            if (existing.find(s => s.server.id === value)) {
                return 'A server with this name already exists';
            }
            return undefined;
        }
    });

    if (!serverName) return;

    const serverAttrs: Record<string, any> = {};
    for (const [key, value] of Object.entries(resolved)) {
        if (key === TYPE_ID_KEY || key === 'id' || key === FORMAT_VERSION_KEY) continue;
        serverAttrs[key] = value;
    }

    const createParams: Protocol.ServerAttributes = {
        serverType: serverTypeId,
        id: serverName,
        attributes: serverAttrs
    };

    const response = await client.getOutgoingHandler().createServer(createParams);
    if (!StatusSeverity.isOk(response.status)) {
        throw new Error(response.status.message);
    }

    vscode.window.showInformationMessage(`Server "${serverName}" created from descriptor`);
    return response;
}
