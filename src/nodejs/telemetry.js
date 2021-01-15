/**
 * Copyright 2021 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const F5TeemDevice = require('@f5devcentral/f5-teem').Device;
const constants = require('./constants.js');
const logger = require('./logger.js');

// Use this client to send telemetry - this can be disabled using the phone home setting
class TelemetryClient {
    constructor() {
        this.telemetryType = constants.TELEMETRY_TYPE;
        this.telemetryTypeVersion = constants.TELEMETRY_TYPE_VERSION;
        this.teemAssetInfo = {
            name: constants.NAME,
            version: constants.VERSION
        };
    }

    send(configuration) {
        const teemClient = new F5TeemDevice(this.teemAssetInfo);

        const extraFields = this._processExtraFields(configuration);

        // send telemetry - this can be disabled using the phone home setting
        return teemClient.report(this.telemetryType, this.telemetryTypeVersion, configuration, extraFields)
            .then(() => {
                logger.silly('Telemetry submitted successfully');
                return Promise.resolve({ sent: true });
            })
            .catch((err) => {
                // never reject when sending telemetry, just log any errors
                logger.error(`Sending telemetry failed: ${err.message}`);
                return Promise.resolve({ sent: false });
            });
    }

    _processExtraFields(configuration) {
        return {
            environment: configuration[constants.ENVIRONMENT_KEY_NAME] || 'none',
            featureFlags: this._processFeatureFlags(configuration)
        };
    }

    _processFeatureFlags(configuration) {
        let ipFailover = false;
        let routeFailover = false;

        // set feature flags to true if the key is 'truthy', in the future
        // this could be more specific if an 'enabled':true property existed
        if (configuration[constants.FEATURE_FLAG_KEY_NAMES.IP_FAILOVER]) {
            ipFailover = true;
        }
        if (configuration[constants.FEATURE_FLAG_KEY_NAMES.ROUTE_FAILOVER]) {
            routeFailover = true;
        }

        return {
            ipFailover,
            routeFailover
        };
    }

    createTelemetryData(options) {
        const telemetryData = {
            product: {
                version: constants.VERSION,
                locale: '',
                installDate: '',
                installationId: '',
                environment: options.environment
            },
            operation: {
                featureFlags: {
                    ipFailover: options.ipFailover,
                    routeFailover: options.routeFailover
                },
                clientRequestId: '',
                action: options.action,
                endpoint: options.endpoint,
                userAgent: '',
                result: options.result,
                resultSummary: options.resultSummary,
                resourceCount: options.resourceCount,
                startTime: options.starttime,
                endTime: new Date().toJSON()
            }
        };
        return telemetryData;
    }
}

module.exports = {
    TelemetryClient
};
