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
const Record = require('@f5devcentral/f5-teem').Record;
const localeFunc = require('get-user-locale');
const uuidv4 = require('uuid');
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
        // send telemetry - this can be disabled using the phone home setting
        const teemClient = new F5TeemDevice(this.teemAssetInfo);
        const record = new Record(constants.TELEMETRY_TYPE, constants.TELEMETRY_TYPE_VERSION);
        return Promise.resolve()
            .then(() => record.addRegKey())
            .then(() => record.calculateAssetId())
            .then(() => record.addJsonObject(configuration))
            .then(() => record.addPlatformInfo())
            .then(() => teemClient.reportRecord(record))
            .then(() => {
                logger.silly('Telemetry submitted successfully');
                let serializedConfig;
                try {
                    serializedConfig = JSON.stringify(configuration);
                } catch (e) {
                    logger.silly(`Unable to stringify telemetry configuration: ${e.message}`);
                    logger.error(`Sending telemetry failed: ${e && (e.stack || e.message)}`);
                }
                logger.silly(`Telemetry payload: ${serializedConfig}`);
                return Promise.resolve({ sent: true });
            })
            .catch((err) => {
                // never reject when sending telemetry, just log any errors
                const message = (err && typeof err.message === 'string') ? err.message : String(err);
                logger.error(`Sending telemetry failed: ${message}`);
                if ((err && err.code === 'ETIMEDOUT') || (typeof message === 'string' && message.includes('timeout'))) {
                    logger.error('This error may indicate that the telemetry service is unavailable, which could be due to network connectivity issues or the telemetry service being down. Please check your network connection and try again later.');
                }
                return Promise.resolve({ sent: false });
            });
    }

    _processExtraFields(configuration) {
        configuration.environment = configuration[constants.ENVIRONMENT_KEY_NAME] || 'none';
        configuration.featureFlags = this._processFeatureFlags(configuration);
        return configuration;
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
            customerId: options.customerId,
            failover: options.failover,
            product: {
                version: constants.VERSION,
                locale: localeFunc.getUserLocale(),
                installDate: (new Date()).toISOString(),
                installationId: '',
                environment: options.environment,
                region: options.region
            },
            featureFlags: {
                ipFailover: options.ipFailover || false,
                routeFailover: options.routeFailover || false
            },
            operation: {
                clientRequestId: uuidv4(),
                action: options.action,
                endpoint: options.endpoint,
                userAgent: options.userAgent || `f5-cloud-failover/${constants.VERSION}`,
                result: options.result,
                resultSummary: options.resultSummary
            }
        };
        return telemetryData;
    }
}

module.exports = {
    TelemetryClient
};
