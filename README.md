# Runtime Server Protocol UI

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/redhat.vscode-rsp-ui?style=for-the-badge&label=VS%20Marketplace&logo=visual-studio-code&color=blue)](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-rsp-ui)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/redhat.vscode-rsp-ui?style=for-the-badge&color=purple)](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-rsp-ui)
[![Gitter](https://img.shields.io/gitter/room/redhat-developer/server-connector?style=for-the-badge&logo=gitter)](https://gitter.im/redhat-developer/server-connector)
[![Build Status](https://img.shields.io/github/actions/workflow/status/redhat-developer/vscode-rsp-ui/gh-actions.yml?style=for-the-badge&logo=github)](https://github.com/redhat-developer/vscode-rsp-ui/actions)
[![License](https://img.shields.io/badge/license-EPLv2.0-brightgreen.png?style=for-the-badge)](https://github.com/redhat-developer/vscode-rsp-ui/blob/master/LICENSE)

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
   * `Run on Server` - By selecting an application (e.g war file) directly from the explorer context view, the application will be deployed and the server started.
   * `Debug on Server` - By selecting an application (e.g war file) directly from the explorer context view, the application will be deployed and the server started in Debug mode.

## Extension Settings

   This extension contributes the following settings:

   * `vscodeAdapters.showChannelOnServerOutput`: enable/disable the server output channel logs
   * `rsp-ui.rsp.java.home`: Specifies the path to a full JDK (version 11 or newer) which will be used to launch the Runtime Server Protocol (RSP) Server, as well as be the default java to launch any Java-based runtimes that the RSP will control.<br>On Windows, backslashes must be escaped, i.e.<br>`"rsp-ui.rsp.java.home":"C:\\Program Files\\Java\\jdk-11.0.13"`
   * `rsp-ui.enableStartServerOnActivation`: Specifies which RSP Server have to be automatically started during activation. If option is disabled, user will have to manually start the RSP Server through command palette or context menu
   * `rsp-ui.enableAsyncPublish`: enable/disable async publishing

## Server Parameters
   To change Server Parameters, right-click on the server you want to edit and select `Edit Server`

### Global Server Parameters
   These settings are valid for all servers

   * `"id"` - id server (read-only field, it cannot be changed)
   * `"server.home.dir"` - the path where the server runtime is stored (read-only field, it cannot be changed)
   * `"server.autopublish.enabled"` - Enable the autopublisher
   * `"server.autopublish.inactivity.limit"` - Set the inactivity limit before the autopublisher runs
   * `"server.timeout.startup"` - set how long (ms) to wait for a server to be recognized as started before giving up
   * `"server.timeout.shutdown"` - set how long (ms) to wait for a server to be recognized as stopped before giving up
   * `"vm.install.path"` - A string representation pointing to a java home. If not set, rsp-ui.rsp.java.home will be used instead
   * `"deployables"` - the list of deployables. It contains all informations related to each deployable.

### Provisional Global Server Parameters
   These settings may eventually be supported by all servers, but these settings are Provisional and may be changed before becoming official API. 
   * `"args.override.boolean"` - allow to override program and vm arguments if set to true. The first time this flag is set to true and the server is started, two other parameters will be generated "args.vm.override.string" and "args.program.override.string". 
   * `"args.vm.override.string"` - allow to override vm arguments. Once you edited this flag, *make sure "args.override.boolean" is set to true before launching your server. Otherwise the server will attempt to auto-generate the launch arguments as it normally does.*
   * `"args.program.override.string"` - allow to override program arguments. Once you edited this flag, *make sure "args.override.boolean" is set to true before launching your server. Otherwise the server will attempt to auto-generate the launch arguments as it normally does.*
   * `"mapProperty.launch.env"` - allow to override or add to the environment being passed to a server upon startup. This property's value should be a object with a set of key-value pairs, where the key should be a desired environment variable, and the value being the value of that object.*
   
### Provisional Project Structure Details
   The following project structure options may not be supported by all server types and deployment types. These details are Provisional and may be changed before becoming official API. 
   
   A workspace project may choose to have a `.rsp/rsp.assembly.json` file which may dictate very simple packaging instructions. Many server types will attempt to use this packaging file for both incremental and full publish events, so that the user experience can be improved without requiring full builds with a user's chosen build system for each change. 
   
   Attempts will also be made to interpret a project's `.settings/org.eclipse.wst.common.component` file, though current integration issues with jdt.ls make this not very useful at the moment. 
   
#### .rsp/rsp.assembly.json file structure
An example packaging file may look like this:

```
{
	"mappings": [
		{
			"source-path": "target/classes/",
			"deploy-path": "/WEB-INF/classes/"
		},
		{
			"source-path": "target/rob-hello/",
			"deploy-path": "/"
		},
		{
			"source-path": "src/main/resources/",
			"deploy-path": "/"
		},
		{
			"source-path": "src/main/webapp/",
			"deploy-path": "/"
		},
	]
}
```

A single top-level element name mappings has a value of an array of individual mappings. Each mapping has a source-path and a deploy-path. It is assumed that the same file may be in multiple folders. An xml file, for example, may be available as a source file, but also exist in a build output directory. A .class file, on the other hand, may exist in a java incremental builder output folder, as well as in a build system output folder. 

Mappings should be arranged such that the most up-to-date folder is near the bottom of the list, so that if the server iterates through them in order, the most recent change will be the last one copied in. 


### Supported Servers
   * This extension has no built-in support for any specific server type
   * Support for individual server types is contributed by other extensions catering to their specific server type.


## Q&A

### 1. Is there a video that explain how the VS Code Server Connector extension and the Runtime Server Protocol work?
Yes. This is the video you can watch to learn more about this extension https://www.youtube.com/watch?v=sP2Hlw-C_7I

## Install extension locally
This is an open source project open to anyone. This project welcomes contributions and suggestions!!

Download the most recent `rsp-ui-<version>.vsix` file and install it by following the instructions [here](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix). 

Stable releases are archived under http://download.jboss.org/jbosstools/adapters/snapshots/vscode-middleware-tools/rsp-ui/

## Community, discussion, contribution, and support

**Issues:** If you have an issue/feature-request with the rsp-ui extension, please file it [here](https://github.com/redhat-developer/vscode-rsp-ui/issues).

**Contributing:** Want to become a contributor and submit your own code? Have a look at our [development guide](https://github.com/redhat-developer/vscode-rsp-ui/blob/master/CONTRIBUTING.md).

**Chat:** Chat with us on [Gitter](https://gitter.im/redhat-developer/server-connector).

License
=======
EPL 2.0, See [LICENSE](LICENSE) for more information.


## Data and telemetry

The RSP UI extension by Red Hat for Visual Studio Code collects anonymous [usage data](USAGE_DATA.md) and sends it to Red Hat servers to help improve our products and services. Read our [privacy statement](https://developers.redhat.com/article/tool-data-collection) to learn more. This extension respects the `redhat.telemetry.enabled` setting which you can learn more about at https://github.com/redhat-developer/vscode-redhat-telemetry#how-to-disable-telemetry-reporting

