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
}
