import * as path from 'path';

import {
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

        console.log(extensionDevelopmentPath, extensionTestsPath);

        const options = {
            extensionDevelopmentPath: extensionDevelopmentPath,
            extensionTestsPath: extensionTestsPath,
            version: '1.69.2',
        };
        await runTests(options);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
