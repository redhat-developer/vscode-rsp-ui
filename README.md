# Server Connector

[![Build Status](https://travis-ci.org/redhat-developer/vscode-rsp-ui.svg?branch=master)](https://travis-ci.org/redhat-developer/vscode-rsp-ui)
[![License](https://img.shields.io/badge/license-EPLv2.0-brightgreen.svg)](https://github.com/redhat-developer/vscode-rsp-ui/blob/master/README.md)
[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/version/redhat.vscode-rsp-ui.svg)](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-rsp-ui)
[![Gitter](https://badges.gitter.im/redhat-developer/server-connector.svg)](https://gitter.im/redhat-developer/server-connector?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

A Visual Studio Code extension that provides a unified UI for any RSP (Runtime Server Protocol) provider to contribute their RSP implementation to. 

## Warning: Not a standalone extension

This extension on its own provides no support for any specific runtimes. If you install only this extension, 
the views and actions may appear not to function. 

To be used properly, this extension requires other contributing extensions that provide implementations
that start or stop specific RSP instances and are capable of managing specific server or runtime types.

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
   * `Add Deployment to Server` - Add a deployable file or folder to the server to be published.
   * `Remove Deployment from Server` - Remove a deployment from the server.
   * `Publish Server (Full)` - Publish the server, synchronizing the content of deployments from your workspace to the server.
   * `Show Output Channel` - Select a particular server from the list to show its output channel in the editor.
   * `Edit Server` - View a JSON representation of your server in an editor, and submit changes to properties back to the RSP. 
   * `Download Runtime` - Some server types may expose to the user methods to download a version of specific runtimes or frameworks, extract them, and set them up to be used by the RSP. 
   * `Server Actions` - Some server types may expose to the user arbitrary actions that the user may invoke, such as changing some configuration options, opening a web browser, or editing a configuration file. These server-contributed actions have few restrictions placed on them by the framework other than what may be done on the client-side. 


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
