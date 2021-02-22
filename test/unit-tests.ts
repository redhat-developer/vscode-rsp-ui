import * as path from 'path';
import * as cp from 'child_process';

import {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
  runTests
} from 'vscode-test';


async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../..');

        // The path to the extension test runner script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './');


        const vscodeExecutablePath = await downloadAndUnzipVSCode();
        const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

        // Use cp.spawn / cp.exec for custom setup
        cp.spawnSync(cliPath, ['--install-extension', 'redhat.commons'], {
        	encoding: 'utf-8',
        	stdio: 'inherit'
        });

        // Download VS Code, unzip it and run the integration test
        console.log(extensionDevelopmentPath, extensionTestsPath);
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
