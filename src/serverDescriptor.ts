/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';

import { Protocol, RSPClient, StatusSeverity } from 'rsp-client';
import { ServerExplorer } from './serverExplorer';
import { myContext } from './extension';
import * as vscode from 'vscode';
import { IWizardPage, SEVERITY, ValidatorResponseItem, WebviewWizard, WizardDefinition, WizardPageFieldDefinition, WizardPageSectionDefinition } from '@redhat-developer/vscode-wizard';
import { PerformFinishResponse } from '@redhat-developer/vscode-wizard/lib/IWizardWorkflowManager';

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
): Promise<void> {
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
    const defaultName = explorer.getDefaultServerName(rspId, serverType);

    const initialData: Map<string, string> = new Map<string, string>();
    initialData.set('id', defaultName);

    const fields: (WizardPageFieldDefinition | WizardPageSectionDefinition)[] = [];

    fields.push({
        id: 'id',
        type: 'textbox',
        label: 'Server Name*',
        initialValue: defaultName
    });

    if (variables.length > 0) {
        const pathFields: WizardPageFieldDefinition[] = variables.map(varKey => {
            const isFileKey = /\.file\b/i.test(varKey) && !/\.dir\b/i.test(varKey);
            const field: WizardPageFieldDefinition = {
                id: `var_${varKey}`,
                type: 'file-picker',
                label: `${varKey}*`,
                description: `Local path for ${varKey}`,
                initialValue: ''
            };
            if (!isFileKey) {
                field.dialogOptions = {
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: `Select folder for ${varKey}`
                };
            }
            return field;
        });

        fields.push({
            id: 'pathVariablesSection',
            label: 'Local Paths',
            description: 'These paths were detected as machine-specific in the descriptor. Select the local path for each.',
            childFields: pathFields
        } as WizardPageSectionDefinition);
    }

    const def: WizardDefinition = {
        title: `Import Server: ${serverType.visibleName}`,
        description: `Create a new ${serverType.visibleName} server from a shared descriptor file.`,
        pages: [
            {
                id: 'importPage1',
                title: 'Import Server from Descriptor',
                description: 'Provide a server name and fill in any machine-specific paths.',
                fields,
                validator: (parameters: any) => {
                    const errors: ValidatorResponseItem[] = [];
                    if (!parameters.id || parameters.id === '') {
                        errors.push({
                            template: { id: 'idValidation', content: 'Server name must not be empty.' },
                            severity: SEVERITY.ERROR
                        });
                    } else {
                        const existing = explorer.getServerStatesByRSP(rspId);
                        if (existing.find(s => s.server.id === parameters.id)) {
                            errors.push({
                                template: { id: 'idValidation', content: 'A server with this name already exists.' },
                                severity: SEVERITY.ERROR
                            });
                        }
                    }
                    for (const varKey of variables) {
                        const fieldId = `var_${varKey}`;
                        if (!parameters[fieldId] || parameters[fieldId] === '') {
                            errors.push({
                                template: { id: `${fieldId}Validation`, content: `${varKey} must not be empty.` },
                                severity: SEVERITY.ERROR
                            });
                        }
                    }
                    return { items: errors };
                }
            }
        ],
        workflowManager: {
            canFinish(_wizard: WebviewWizard, data: any): boolean {
                if (!data.id || data.id === '') return false;
                for (const varKey of variables) {
                    if (!data[`var_${varKey}`] || data[`var_${varKey}`] === '') return false;
                }
                return true;
            },
            async performFinish(_wizard: WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
                try {
                    const variableValues = new Map<string, string>();
                    for (const varKey of variables) {
                        variableValues.set(varKey, data[`var_${varKey}`]);
                    }

                    const resolved = resolveVariables(attrs, variableValues);

                    const serverAttrs: Record<string, any> = {};
                    for (const [key, value] of Object.entries(resolved)) {
                        if (key === TYPE_ID_KEY || key === 'id' || key === FORMAT_VERSION_KEY) continue;
                        serverAttrs[key] = value;
                    }

                    const createParams: Protocol.ServerAttributes = {
                        serverType: serverTypeId,
                        id: data.id,
                        attributes: serverAttrs
                    };

                    const response = await client.getOutgoingHandler().createServer(createParams);
                    if (!StatusSeverity.isOk(response.status)) {
                        return {
                            close: false,
                            success: false,
                            returnObject: {},
                            templates: [{ id: 'description', content: response.status.message }]
                        };
                    }

                    vscode.window.showInformationMessage(`Server "${data.id}" created from descriptor`);
                    return null;
                } catch (e) {
                    return {
                        close: false,
                        success: false,
                        returnObject: {},
                        templates: [{ id: 'description', content: String(e) }]
                    };
                }
            },
            getNextPage(_page: IWizardPage, _data: any): IWizardPage | null {
                return null;
            },
            getPreviousPage(_page: IWizardPage, _data: any): IWizardPage | null {
                return null;
            }
        }
    };

    const wiz = new WebviewWizard('Import Server Wizard', 'ImportServerWizard',
        myContext, def, initialData);
    wiz.open();
}
