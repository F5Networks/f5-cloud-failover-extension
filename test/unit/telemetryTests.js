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
const logger = require('../../src/nodejs/logger.js');
const TelemetryClient = require('../../src/nodejs/telemetry.js').TelemetryClient;

/* eslint-disable global-require */

describe('Telemetry Client', () => {
    beforeEach(() => {
        this.f5TeemReportMock = sinon.stub(f5Teem.prototype, 'reportRecord').resolves();

        this.telemetryClient = new TelemetryClient();

        this.configuration = {};
        this.configuration[constants.ENVIRONMENT_KEY_NAME] = 'gcp';
        this.configuration[constants.FEATURE_FLAG_KEY_NAMES.IP_FAILOVER] = {
            scopingTags: {}
        };
        this.configuration[constants.FEATURE_FLAG_KEY_NAMES.ROUTE_FAILOVER] = {
            scopingTags: {}
        };
        this.configuration = this.telemetryClient.createTelemetryData({
            customerId: 'test-customer-id',
            failover: {
                event: true,
                success: true,
                totalRoutes: 3,
                totalIps: 1,
                startTime: 'test-stat-time-here',
                endTime: 'test-end-time-here'
            },
            environment: 'gcp',
            region: 'us-west',
            ipFailover: true,
            routeFailover: true,
            action: 'POST',
            result: 'SUCCESS',
            endpoint: 'trigger'
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should send telemetry', () => this.telemetryClient.send(this.configuration)
        .then(() => {
            const actualCallArgs = this.f5TeemReportMock.getCall(0).args;
            const expectedCallArgs = [{
                documentType: 'f5-cloud-failover-data',
                documentVersion: '1',
                recordBody: {
                    regkey: 'unknown',
                    customerId: 'test-customer-id',
                    failover: {
                        event: true,
                        success: true,
                        totalRoutes: 3,
                        totalIps: 1,
                        startTime: 'test-stat-time-here',
                        endTime: 'test-end-time-here'
                    },
                    product: {
                        version: '1.9.0',
                        locale: 'en-US',
                        installationId: '',
                        environment: 'gcp',
                        region: 'us-west'
                    },
                    featureFlags: {
                        ipFailover: true,
                        routeFailover: true
                    },
                    operation: {
                        action: 'POST',
                        endpoint: 'trigger',
                        userAgent: `f5-cloud-failover/${constants.PKG_VERSION}`,
                        result: 'SUCCESS'
                    },
                    platformID: 'unknown',
                    platform: 'unknown',
                    platformVersion: 'unknown',
                    nicConfiguration: 'unknown'
                },
                deviceInfo: {
                    platformId: 'unknown',
                    platform: 'unknown',
                    platformVersion: 'unknown',
                    license: {
                        registrationKey: 'unknown',
                        activeModules: []
                    }
                },
                calculatedId: 'unknown',
                nicConfiguration: 'unknown',
                cloudInfo: {}
            }];
            assert.strictEqual(actualCallArgs[0].recordBody.customerId, expectedCallArgs[0].recordBody.customerId);
            assert.strictEqual(actualCallArgs[0].recordBody.operation.userAgent,
                expectedCallArgs[0].recordBody.operation.userAgent);
            assert.deepStrictEqual(actualCallArgs[0].recordBody.failover, expectedCallArgs[0].recordBody.failover);
            assert.deepStrictEqual(actualCallArgs[0].recordBody.featureFlags,
                expectedCallArgs[0].recordBody.featureFlags);
        })
        .catch((err) => Promise.reject(err)));

    it('should send telemetry with feature flags set to false and custom userAgent', () => {
        this.configuration = this.telemetryClient.createTelemetryData({
            customerId: 'test-customer-id',
            failover: {
                event: true,
                success: true,
                totalRoutes: 3,
                totalIps: 1,
                startTime: 'test-stat-time-here',
                endTime: 'test-end-time-here'
            },
            userAgent: 'test-user-agent',
            environment: 'gcp',
            region: 'us-west',
            action: 'POST',
            result: 'SUCCESS',
            endpoint: 'trigger'
        });
        return this.telemetryClient.send(this.configuration)
            .then(() => {
                const actualCallArgs = this.f5TeemReportMock.getCall(0).args;
                const expectedCallArgs = [{
                    documentType: 'f5-cloud-failover-data',
                    documentVersion: '1',
                    recordBody: {
                        regkey: 'unknown',
                        customerId: 'test-customer-id',
                        failover: {
                            event: true,
                            success: true,
                            totalRoutes: 3,
                            totalIps: 1,
                            startTime: 'test-stat-time-here',
                            endTime: 'test-end-time-here'
                        },
                        product: {
                            version: '1.9.0',
                            locale: 'en-US',
                            installationId: '',
                            environment: 'gcp',
                            region: 'us-west'
                        },
                        featureFlags: {
                            ipFailover: false,
                            routeFailover: false
                        },
                        operation: {
                            action: 'POST',
                            endpoint: 'trigger',
                            userAgent: 'test-user-agent',
                            result: 'SUCCESS'
                        },
                        platformID: 'unknown',
                        platform: 'unknown',
                        platformVersion: 'unknown',
                        nicConfiguration: 'unknown'
                    },
                    deviceInfo: {
                        platformId: 'unknown',
                        platform: 'unknown',
                        platformVersion: 'unknown',
                        license: {
                            registrationKey: 'unknown',
                            activeModules: []
                        }
                    },
                    calculatedId: 'unknown',
                    nicConfiguration: 'unknown',
                    cloudInfo: {}
                }];
                assert.deepStrictEqual(actualCallArgs[0].recordBody.featureFlags,
                    expectedCallArgs[0].recordBody.featureFlags);
                assert.strictEqual(actualCallArgs[0].recordBody.operation.userAgent,
                    expectedCallArgs[0].recordBody.operation.userAgent);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should handle telemetry send failure gracefully', () => {
        this.f5TeemReportMock.restore();
        sinon.stub(f5Teem.prototype, 'reportRecord').rejects(new Error('Telemetry service unavailable'));

        return this.telemetryClient.send(this.configuration)
            .then((result) => {
                assert.strictEqual(result.sent, false);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should resolve sent true when configuration cannot be stringified', () => {
        // create a configuration with a circular reference so JSON.stringify throws,
        // exercising the catch (e) handler in the success path
        const sillyStub = sinon.stub(logger, 'silly');
        const circularConfig = {};
        circularConfig.self = circularConfig;

        return this.telemetryClient.send(circularConfig)
            .then((result) => {
                assert.strictEqual(result.sent, true);
                // confirm the inner catch (e) handler logged the stringify failure
                assert.strictEqual(sillyStub.calledWithMatch(/Unable to stringify telemetry configuration/), true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should log timeout guidance when send fails with ETIMEDOUT code', () => {
        const errorStub = sinon.stub(logger, 'error');
        this.f5TeemReportMock.restore();
        const timeoutError = new Error('connection problem');
        timeoutError.code = 'ETIMEDOUT';
        sinon.stub(f5Teem.prototype, 'reportRecord').rejects(timeoutError);

        return this.telemetryClient.send(this.configuration)
            .then((result) => {
                // the ETIMEDOUT branch logs additional guidance but never rejects
                assert.strictEqual(result.sent, false);
                assert.strictEqual(errorStub.calledWithMatch(/telemetry service is unavailable/), true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should log timeout guidance when send fails with a timeout message', () => {
        const errorStub = sinon.stub(logger, 'error');
        this.f5TeemReportMock.restore();
        sinon.stub(f5Teem.prototype, 'reportRecord').rejects(new Error('request timeout exceeded'));

        return this.telemetryClient.send(this.configuration)
            .then((result) => {
                // the message.includes('timeout') branch logs additional guidance but never rejects
                assert.strictEqual(result.sent, false);
                assert.strictEqual(errorStub.calledWithMatch(/telemetry service is unavailable/), true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should not log timeout guidance when send fails with a non-timeout error', () => {
        const errorStub = sinon.stub(logger, 'error');
        this.f5TeemReportMock.restore();
        sinon.stub(f5Teem.prototype, 'reportRecord').rejects(new Error('generic failure'));

        return this.telemetryClient.send(this.configuration)
            .then((result) => {
                // the guidance branch must not fire for unrelated errors
                assert.strictEqual(result.sent, false);
                assert.strictEqual(errorStub.calledWithMatch(/telemetry service is unavailable/), false);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process extra fields with environment key', () => {
        const config = {};
        config[constants.ENVIRONMENT_KEY_NAME] = 'azure';
        config[constants.FEATURE_FLAG_KEY_NAMES.IP_FAILOVER] = { enabled: true };

        const processed = this.telemetryClient._processExtraFields(config);

        assert.strictEqual(processed.environment, 'azure');
        assert.strictEqual(processed.featureFlags.ipFailover, true);
        assert.strictEqual(processed.featureFlags.routeFailover, false);
    });

    it('should process extra fields without environment key', () => {
        const config = {};
        config[constants.FEATURE_FLAG_KEY_NAMES.ROUTE_FAILOVER] = { enabled: true };

        const processed = this.telemetryClient._processExtraFields(config);

        assert.strictEqual(processed.environment, 'none');
        assert.strictEqual(processed.featureFlags.ipFailover, false);
        assert.strictEqual(processed.featureFlags.routeFailover, true);
    });

    it('should process feature flags when both are enabled', () => {
        const config = {};
        config[constants.FEATURE_FLAG_KEY_NAMES.IP_FAILOVER] = { enabled: true };
        config[constants.FEATURE_FLAG_KEY_NAMES.ROUTE_FAILOVER] = { enabled: true };

        const featureFlags = this.telemetryClient._processFeatureFlags(config);

        assert.strictEqual(featureFlags.ipFailover, true);
        assert.strictEqual(featureFlags.routeFailover, true);
    });

    it('should process feature flags when both are disabled', () => {
        const config = {};

        const featureFlags = this.telemetryClient._processFeatureFlags(config);

        assert.strictEqual(featureFlags.ipFailover, false);
        assert.strictEqual(featureFlags.routeFailover, false);
    });
});
