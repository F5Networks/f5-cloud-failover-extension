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

const assert = require('assert');
const sinon = require('sinon');
const f5Teem = require('@f5devcentral/f5-teem').Device;
const constants = require('../constants.js');
const TelemetryClient = require('../../src/nodejs/telemetry.js').TelemetryClient;

/* eslint-disable global-require */

describe('Telemetry Client', () => {
    beforeEach(() => {
        this.f5TeemReportMock = sinon.stub(f5Teem.prototype, 'report').resolves();

        this.telemetryClient = new TelemetryClient();

        this.configuration = {};
        this.configuration[constants.ENVIRONMENT_KEY_NAME] = 'gcp';
        this.configuration[constants.FEATURE_FLAG_KEY_NAMES.IP_FAILOVER] = {
            scopingTags: {}
        };
        this.configuration[constants.FEATURE_FLAG_KEY_NAMES.ROUTE_FAILOVER] = {
            scopingTags: {}
        };
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should send telemetry', () => this.telemetryClient.send(this.configuration)
        .then(() => {
            const actualCallArgs = this.f5TeemReportMock.getCall(0).args;
            const expectedCallArgs = [
                constants.TELEMETRY_TYPE,
                constants.TELEMETRY_TYPE_VERSION,
                this.configuration,
                {
                    environment: this.configuration[constants.ENVIRONMENT_KEY_NAME],
                    featureFlags: {
                        ipFailover: true,
                        routeFailover: true
                    }
                }
            ];
            assert.deepStrictEqual(actualCallArgs, expectedCallArgs);
        })
        .catch((err) => Promise.reject(err)));

    it('should send telemetry with feature flags set to false', () => {
        delete this.configuration[constants.FEATURE_FLAG_KEY_NAMES.IP_FAILOVER];
        delete this.configuration[constants.FEATURE_FLAG_KEY_NAMES.ROUTE_FAILOVER];

        return this.telemetryClient.send(this.configuration)
            .then(() => {
                const actualCallArgs = this.f5TeemReportMock.getCall(0).args;
                const expectedCallArgs = [
                    constants.TELEMETRY_TYPE,
                    constants.TELEMETRY_TYPE_VERSION,
                    this.configuration,
                    {
                        environment: this.configuration[constants.ENVIRONMENT_KEY_NAME],
                        featureFlags: {
                            ipFailover: false,
                            routeFailover: false
                        }
                    }
                ];
                assert.deepStrictEqual(actualCallArgs, expectedCallArgs);
            })
            .catch((err) => Promise.reject(err));
    });
});
