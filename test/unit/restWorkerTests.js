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

const constants = require('../constants.js');
const srcConstants = require('../../src/nodejs/constants.js');

const ROOT_PATH = 'mgmt/shared/cloud-failover';

/* eslint-disable global-require */

describe('Rest Operations', () => {
    let WorkerClient;
    let Device;
    let Cloud;
    let FailoverClient;
    let TelemetryClient;

    let failoverInitSpy;

    beforeEach(() => {
        WorkerClient = require('../../src/nodejs/restWorkers/main.js');
        Device = require('../../src/nodejs/device');
        Cloud = require('../../src/nodejs/providers/azure/cloud.js').Cloud;
        FailoverClient = require('../../src/nodejs/failover.js').FailoverClient;
        TelemetryClient = require('../../src/nodejs/telemetry.js').TelemetryClient;

        sinon.stub(Device.prototype, 'init').resolves();
        failoverInitSpy = sinon.stub(FailoverClient.prototype, 'init').resolves();
    });
    afterEach(() => {
        sinon.restore();
        // Delete the main.js module from cache to reset module-level variables
        delete require.cache[require.resolve('../../src/nodejs/restWorkers/main.js')];
    });

    function createRestOperation(options) {
        function MockRestOperation() {
            this.method = options.method || 'GET';
            this.body = options.body || {};

            // response attributes
            this.statusCode = null;
            this.responseBody = null;
        }

        MockRestOperation.prototype.getUri = function () {
            return {
                pathname: `${ROOT_PATH}/${options.endpoint || 'declare'}`
            };
        };
        MockRestOperation.prototype.getContentType = function () {
            return options.contentType || 'application/json';
        };
        MockRestOperation.prototype.getBody = function () {
            return this.body;
        };
        MockRestOperation.prototype.setBody = function (body) {
            this.responseBody = body;
        };
        MockRestOperation.prototype.setStatusCode = function (code) {
            this.statusCode = code;
        };
        MockRestOperation.prototype.complete = function () {
        };

        return new MockRestOperation();
    }

    it('should process GET to the configuration endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: constants.DATA_GROUP_OBJECT
        });

        return worker.onPost(createRestOperation({ method: 'GET', endpoint: 'declare' }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process POST to the configuration endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: constants.DATA_GROUP_OBJECT
        });
        sinon.stub(Device.prototype, 'createDataGroup').resolves(constants.DATA_GROUP_OBJECT);
        sinon.stub(Device.prototype, 'executeBigIpBashCmd').resolves('');
        sinon.stub(Cloud.prototype, 'init').resolves();
        const telemetrySpy = sinon.stub(TelemetryClient.prototype, 'send').resolves();

        return worker.onPost(createRestOperation({
            method: 'POST',
            endpoint: 'declare',
            body: constants.declarations.basic
        }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
                assert.strictEqual(failoverInitSpy.called, true);
                assert.strictEqual(telemetrySpy.called, true);
                const callArg = telemetrySpy.getCall(0).lastArg;
                assert.strictEqual(callArg.product.environment, 'azure');
                assert.strictEqual(callArg.operation.result, 'SUCCESS');
                assert.strictEqual(callArg.operation.resultSummary, 'Configuration Successful');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process POST to the trigger endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(Device.prototype, 'getGlobalSettings').resolves({});
        sinon.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
            taskState: constants.FAILOVER_STATES.PASS
        });
        sinon.stub(FailoverClient.prototype, 'execute').resolves({});

        return worker.onPost(createRestOperation({ method: 'POST', endpoint: 'trigger' }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process POST dry-run to the trigger endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(FailoverClient.prototype, 'dryRun').resolves({});

        return worker.onPost(createRestOperation({
            method: 'POST',
            endpoint: 'trigger',
            body: { action: 'dry-run' }
        }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process GET to the trigger endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
            taskState: constants.FAILOVER_STATES.PASS
        });

        return worker.onPost(createRestOperation({ method: 'GET', endpoint: 'trigger' }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process GET to the trigger endpoint (failover failed)', () => {
        const worker = new WorkerClient();

        sinon.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
            taskState: constants.FAILOVER_STATES.FAIL
        });

        return worker.onPost(createRestOperation({ method: 'GET', endpoint: 'trigger' }))
            .then((data) => {
                assert.strictEqual(data.status, 500, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process POST to the reset endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(FailoverClient.prototype, 'resetFailoverState').resolves({});

        return worker.onPost(createRestOperation({ method: 'POST', endpoint: 'reset' }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process GET to the inspect endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(FailoverClient.prototype, 'getFailoverStatusAndObjects').resolves({});

        return worker.onPost(createRestOperation({ method: 'GET', endpoint: 'inspect' }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process GET to the info endpoint', () => {
        const worker = new WorkerClient();

        return worker.onPost(createRestOperation({ method: 'GET', endpoint: 'info' }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    ['onGet', 'onPost', 'onPut', 'onPatch', 'onDelete'].forEach((methodHook) => {
        it(`should process GET to the info endpoint from ${methodHook}`, () => {
            const worker = new WorkerClient();

            return worker[methodHook](createRestOperation({ method: 'GET', endpoint: 'info' }))
                .then((data) => {
                    assert.strictEqual(data.status, 200, JSON.stringify(data.body));
                })
                .catch((err) => Promise.reject(err));
        });
    });

    it('should process GET to the info endpoint with arbitrary content type', () => {
        const worker = new WorkerClient();

        return worker.onPost(createRestOperation({
            method: 'GET',
            endpoint: 'info',
            contentType: 'text',
            body: JSON.stringify({ foo: 'bar' })
        }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
            })
            .catch((err) => Promise.reject(err));
    });

    it('should process retry failover on POST to the configuration endpoint', () => {
        const worker = new WorkerClient();

        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: constants.DATA_GROUP_OBJECT
        });
        sinon.stub(Device.prototype, 'createDataGroup').resolves(constants.DATA_GROUP_OBJECT);
        sinon.stub(Device.prototype, 'executeBigIpBashCmd').resolves('');
        sinon.stub(TelemetryClient.prototype, 'send').resolves();
        sinon.stub(Cloud.prototype, 'init').resolves();
        return worker.onPost(createRestOperation({
            method: 'POST',
            endpoint: 'declare',
            body: constants.declarations.basicWithRetryFailover
        }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
                assert.notStrictEqual(worker.retryInterval, null);
            })
            .then(() => worker.onPost(createRestOperation({
                method: 'POST',
                endpoint: 'declare',
                body: constants.declarations.basic
            })))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
                assert.strictEqual(worker.retryInterval, null);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should set 500 when FailoverClient.execute throws', function () {
        const worker = new WorkerClient();

        sinon.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
            taskState: constants.FAILOVER_STATES.PASS
        });
        sinon.stub(FailoverClient.prototype, 'execute').rejects(new Error('exec fail'));

        const restOp = {
            method: 'POST',
            getUri: () => ({ pathname: 'mgmt/shared/cloud-failover/trigger' }),
            getContentType: () => 'application/json',
            getBody: () => ({}),
            setBody: (b) => { this._body = b; },
            setStatusCode: (c) => { this._status = c; },
            complete: () => {}
        };

        return worker.onPost(restOp)
            .then((response) => {
                assert.strictEqual(response.status, 500);
                assert(response.body.message.indexOf('max tries reached') !== -1);
            });
    });

    it('should set custom state file name when provided in configuration', () => {
        const worker = new WorkerClient();

        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: constants.DATA_GROUP_OBJECT
        });
        sinon.stub(Device.prototype, 'createDataGroup').resolves(constants.DATA_GROUP_OBJECT);
        sinon.stub(Device.prototype, 'executeBigIpBashCmd').resolves('');
        sinon.stub(Cloud.prototype, 'init').resolves();
        sinon.stub(TelemetryClient.prototype, 'send').resolves();
        const setStateFileNameSpy = sinon.spy(FailoverClient.prototype, 'setStateFileName');

        return worker.onPost(createRestOperation({
            method: 'POST',
            endpoint: 'declare',
            body: constants.declarations.basicWithStateFileName
        }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
                // First call uses the default state file name
                assert.strictEqual(setStateFileNameSpy.getCall(0).args[0], srcConstants.STATE_FILE_NAME);
                // Second call uses the custom state file name from config
                assert.strictEqual(setStateFileNameSpy.getCall(1).args[0], 'custom-state-file.json');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should not call setStateFileName with custom name when stateFileName is not provided in configuration', () => {
        const worker = new WorkerClient();

        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: constants.DATA_GROUP_OBJECT
        });
        sinon.stub(Device.prototype, 'createDataGroup').resolves(constants.DATA_GROUP_OBJECT);
        sinon.stub(Device.prototype, 'executeBigIpBashCmd').resolves('');
        sinon.stub(Cloud.prototype, 'init').resolves();
        sinon.stub(TelemetryClient.prototype, 'send').resolves();
        const setStateFileNameSpy = sinon.spy(FailoverClient.prototype, 'setStateFileName');

        return worker.onPost(createRestOperation({
            method: 'POST',
            endpoint: 'declare',
            body: constants.declarations.basic
        }))
            .then((data) => {
                assert.strictEqual(data.status, 200, JSON.stringify(data.body));
                // setStateFileName is called once with the default state file name
                assert.strictEqual(setStateFileNameSpy.callCount, 1);
                assert.strictEqual(setStateFileNameSpy.getCall(0).args[0], srcConstants.STATE_FILE_NAME);
            })
            .catch((err) => Promise.reject(err));
    });
});
