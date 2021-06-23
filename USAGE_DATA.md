# Data collection

[RSP UI by Red Hat](https://github.com/redhat-developer/vscode-rsp-ui) has opt-in telemetry collection, provided by [vscode-redhat-telemetry](https://github.com/redhat-developer/vscode-redhat-telemetry).

## What's included in the RSP UI telemetry data

* when extension is activated
* when a command contributed by extension is executed
    * command's ID
    * command's duration time
    * command's error message (in case of exception)
    * command's specific data (see details below)
* when extension is deactivated

## What's included in the general telemetry data

Please see the
[vscode-redhat-telemetry data collection information](https://github.com/redhat-developer/vscode-redhat-telemetry/blob/HEAD/USAGE_DATA.md#usage-data-being-collected-by-red-hat-extensions)
for information on what data it collects.

## How to opt in or out

Use the `redhat.telemetry.enabled` setting in order to enable or disable telemetry collection.

