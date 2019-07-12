# Server Connector

[![Build Status](https://travis-ci.org/redhat-developer/vscode-rsp-ui.svg?branch=master)](https://travis-ci.org/redhat-developer/vscode-rsp-ui)
[![License](https://img.shields.io/badge/license-EPLv2.0-brightgreen.svg)](https://github.com/redhat-developer/vscode-rsp-ui/blob/master/README.md)
[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/version/redhat.vscode-rsp-ui.svg)](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-rsp-ui)
[![Gitter](https://badges.gitter.im/redhat-developer/server-connector.svg)](https://gitter.im/redhat-developer/server-connector?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

A Visual Studio Code extension that provides a unified UI for any RSP (Runtime Server Protocol) provider to contribute their RSP implementation to. 

## Commands and features

![ screencast ](https://raw.githubusercontent.com/redhat-developer/vscode-rsp-ui/master/screencast/vscode-rsp-ui.gif)

This extension supports a number of commands for interacting with supported server adapters; these are accessible via the command menu (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows and Linux) and may be bound to keys in the normal way.

### Available Commands

   * `Add Server Location` - Selects the path of the server location and display in the SERVERS Explorer stack.
   * `Start` - From the list of servers present, select the server to start.
   * `Restart` - From the list of servers present, select the server to restart.
   * `Stop` - From the list of servers present, select the server to stop.
   * `Remove` - From the list of servers present, select the server to be removed.
   * `Debug` - From the list of servers present, select the server to run in Debug mode.
   * `Add Deployment to Server` - Add a deployable file to the server to be published.
   * `Remove Deployment from Server` - Remove a deployment from the server.
   * `Publish Server (Full)` - Publish the server, synchronizing the content of deployments from your workspace to the server.
   * `Show Output Channel` - Select a particular server from the list to show its output channel in the editor.
   * `Edit Server` - View a JSON representation of your server in an editor, and submit changes to key properties back to the RSP. 

### Supported Servers
   * This extension has no built-in support for any specific server type
   * Support for individual server types is contributed by other extensions catering to their specific server type.

## Extension Settings

This extension contributes the following settings:

* `vscodeAdapters.showChannelOnServerOutput`: enable/disable the server output channel logs

-----------------------------------------------------------------------------------------------------------
## Install extension locally
This is an open source project open to anyone. This project welcomes contributions and suggestions!!

Download the most recent `adapters-<version>.vsix` file and install it by following the instructions [here](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix). 

Stable releases are archived under http://download.jboss.org/jbosstools/adapters/snapshots/vscode-middleware-tools

## Community, discussion, contribution, and support

**Issues:** If you have an issue/feature-request with the rsp-ui extension, please file it [here](https://github.com/redhat-developer/vscode-rsp-ui/issues).

**Contributing:** Want to become a contributor and submit your own code? Have a look at our [development guide](https://github.com/redhat-developer/vscode-rsp-ui/blob/master/CONTRIBUTING.md).

**Chat:** Chat with us on [Gitter](https://gitter.im/redhat-developer/server-connector).

License
=======
EPL 2.0, See [LICENSE](LICENSE) for more information.
