/*******************************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 * Distributed under license by Red Hat, Inc. All rights reserved.
 * This program is made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution,
 * and is available at http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 * Red Hat, Inc. - initial API and implementation
 ******************************************************************************/
import { getTelemetryService, TelemetryEvent, TelemetryService } from '@redhat-developer/vscode-redhat-telemetry';

const telemetryService: Promise<TelemetryService> = getTelemetryService("redhat.vscode-rsp-ui");

export async function getTelemetryServiceInstance(): Promise<TelemetryService> {
    return telemetryService;
}

export function createTrackingEvent(name: string, properties: any = {}): TelemetryEvent {
    return {
        type: 'track',
        name,
        properties
    }
}

export default async function sendTelemetry(actionName: string, properties?: any): Promise<void> {
    const service = await getTelemetryServiceInstance();
    if (actionName === 'activation') {
        return service?.sendStartupEvent();
    }
    return service?.send(createTrackingEvent(actionName, properties));
}
