import { Protocol } from 'rsp-client';
import * as vscode from 'vscode';
import { RSPController } from 'vscode-server-connector-api';

export class Utils {

    public static async activateExternalProvider(id: string): Promise<RSPController> {
        const extension = await vscode.extensions.getExtension<RSPController>(id);
        if (!extension) {
            return Promise.reject(`Failed to retrieve ${id} extension`);
        }
        const rspProvider: RSPController = await extension.activate();
        if (!rspProvider) {
            return Promise.reject(`Failed to activate ${id} extension`);
        }
        return rspProvider;
    }

    public static async getIcon(rspId: string, serverType: string): Promise<vscode.Uri> {
        if (!rspId) {
            return null;
        }
        return await this.activateExternalProvider(rspId).then(rspProvider => {
            const imageUri: vscode.Uri = rspProvider.getImage(serverType);
            if (imageUri && imageUri.fsPath) {
                return imageUri.fsPath;
            } else {
                return null;
            }
        }).catch(error => {
            vscode.window.showErrorMessage(error);
            return null;
        });
    }

    public static isMultilineText(content: string): boolean {
        return content && content.indexOf('\n') !== -1;
    }

    public static async promptUser(item: Protocol.WorkflowResponseItem, workflowMap: {}): Promise<boolean> {
        const prompt = item.label + (item.content ? `\n${item.content}` : '');
        let userInput: any = null;
        if (item.prompt == null || item.prompt.responseType === 'none') {
            userInput = await new Promise<string | undefined>((resolve, reject) => {
                const msg = prompt.replace(/(\r\n|\n|\r)/gm, '');
                const quickPick = vscode.window.createQuickPick();
                quickPick.value = msg;
                quickPick.ignoreFocusOut = true;
                quickPick.items = [{label: 'Continue...', alwaysShow: true, picked: true}];

                quickPick.onDidChangeSelection(items => {
                    resolve(items[0].label);
                    quickPick.hide();
                });

                quickPick.onDidChangeValue(value => {
                    quickPick.value = msg;
                    vscode.window.showInformationMessage('Select Continue... to go to the next step');
                });

                quickPick.onDidHide(() => {
                    resolve(undefined);
                    quickPick.dispose();
                });

                quickPick.show();
            });
        } else {
            if (item.prompt.responseType === 'bool') {
                const oneProp = await vscode.window.showQuickPick(['Yes (True)', 'No (False)'],
                    { placeHolder: prompt, ignoreFocusOut: true });
                userInput = (oneProp === 'Yes (True)');
            } else {
                if (item.prompt.validResponses) {
                    userInput = await vscode.window.showQuickPick(item.prompt.validResponses,
                            { placeHolder: item.label, ignoreFocusOut: true });
                } else {
                    const oneProp = await vscode.window.showInputBox(
                        { prompt: prompt, ignoreFocusOut: true, password: item.prompt.responseSecret });
                    if (item.prompt.responseType === 'int') {
                        userInput = +oneProp;
                    } else {
                        userInput = oneProp;
                    }
                }
            }
        }

        workflowMap[item.id] = userInput;
        return userInput === undefined;
    }
}
