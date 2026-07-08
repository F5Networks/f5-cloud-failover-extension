'use strict';

const sinon = require('sinon');
const chai = require('chai');
const util = require('../../src/nodejs/util.js');
const logger = require('../../src/nodejs/logger.js');
const configWorker = require('../../src/nodejs/config.js');
const Device = require('../../src/nodejs/device.js');
const FailoverClient = require('../../src/nodejs/failover.js').FailoverClient;
const CloudFactory = require('../../src/nodejs/providers/cloudFactory.js');
const TelemetryClient = require('../../src/nodejs/telemetry.js').TelemetryClient;
const constants = require('../../src/nodejs/constants.js');
const schemaUtils = require('../../src/nodejs/schema/schemaUtils.js');
const Worker = require('../../src/nodejs/restWorkers/main.js');

const { expect } = chai;

describe('Worker', () => {
    let worker;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        worker = new Worker();
    });

    afterEach(() => {
        sandbox.restore();
    });

    /**
     * Shared helper — builds a mock restOperation object accepted by Worker.processRequest.
     */
    function makeRestOp(opts) {
        return {
            method: opts.method || 'GET',
            getUri: () => ({ pathname: `/shared/cloud-failover/${opts.endpoint || 'info'}` }),
            getContentType: () => opts.contentType || 'application/json',
            getBody: () => (opts.body !== undefined ? opts.body : {})
        };
    }

    describe('constructor', () => {
        it('should set default properties', () => {
            const w = new Worker();
            expect(w.state).to.deep.equal({});
            expect(w.WORKER_URI_PATH).to.equal('shared/cloud-failover');
            expect(w.isPassThrough).to.equal(true);
            expect(w.isPublic).to.equal(true);
            expect(w.isPersisted).to.equal(true);
            expect(w.isStateRequiredOnStart).to.equal(true);
            expect(w.retryInterval).to.equal(null);
            expect(w.cloudProvider).to.equal(null);
            expect(w.config).to.equal(null);
        });
    });

    describe('onStart', () => {
        it('should call success callback on success', () => {
            const successStub = sandbox.stub();
            const errorStub = sandbox.stub();

            worker.onStart(successStub, errorStub);

            expect(successStub.calledOnce).to.equal(true);
            expect(errorStub.called).to.equal(false);
        });

        it('should call error callback when success throws', () => {
            const successStub = sandbox.stub().throws(new Error('startup failure'));
            const errorStub = sandbox.stub();
            sandbox.stub(logger, 'error');

            worker.onStart(successStub, errorStub);

            expect(errorStub.calledOnce).to.equal(true);
            expect(errorStub.firstCall.args[0]).to.include('startup failure');
        });
    });

    describe('onStartCompleted', () => {
        let successStub;
        let errorStub;

        beforeEach(() => {
            successStub = sandbox.stub();
            errorStub = sandbox.stub();
            sandbox.stub(worker, 'initFailoverInterval');
        });

        // NOTE: The source code has a missing `return` after `error()` on line 93.
        // When errMsg is truthy, error() is called synchronously but the
        // configWorker.init() promise chain still runs. This test verifies the
        // current (fall-through) behavior: error() is called immediately, and
        // then success() is also called once the promise chain resolves.
        it('should call error callback when errMsg is provided and also call success due to fall-through', (done) => {
            worker.logger = { error: sandbox.stub() };

            // Stub the init chain so it succeeds after the synchronous error() call
            sandbox.stub(configWorker, 'init').resolves();
            sandbox.stub(Device.prototype, 'init').resolves();
            sandbox.stub(configWorker, 'getConfig').resolves({});

            let errorCallCount = 0;
            errorStub.callsFake(() => { errorCallCount += 1; });

            successStub.callsFake(() => {
                // error() was called synchronously first, then success() from the promise chain
                expect(errorCallCount).to.equal(1);
                done();
            });

            worker.onStartCompleted(successStub, errorStub, {}, 'error message');

            // Synchronous assertion: error was called immediately
            expect(errorStub.calledOnce).to.equal(true);
        });

        it('should call success on successful init chain', (done) => {
            sandbox.stub(configWorker, 'init').resolves();
            sandbox.stub(Device.prototype, 'init').resolves();
            sandbox.stub(configWorker, 'getConfig').resolves({});

            successStub.callsFake(() => {
                expect(worker.initFailoverInterval.calledOnce).to.equal(true);
                done();
            });
            errorStub.callsFake((err) => done(err || new Error('error callback called unexpectedly')));

            worker.onStartCompleted(successStub, errorStub, {}, null);
        });

        it('should set log level when controls.logLevel is provided in config', (done) => {
            const config = { controls: { logLevel: 'debug' } };
            sandbox.stub(configWorker, 'init').resolves();
            sandbox.stub(Device.prototype, 'init').resolves();
            sandbox.stub(configWorker, 'getConfig').resolves(config);
            const setLogLevelStub = sandbox.stub(logger, 'setLogLevel');

            successStub.callsFake(() => {
                expect(setLogLevelStub.calledWith('debug')).to.equal(true);
                done();
            });
            errorStub.callsFake((err) => done(err || new Error('error callback called unexpectedly')));

            worker.onStartCompleted(successStub, errorStub, {}, null);
        });

        it('should call error callback when init chain rejects', (done) => {
            const initError = new Error('init failed');
            sandbox.stub(configWorker, 'init').rejects(initError);
            sandbox.stub(Device.prototype, 'init').resolves();

            errorStub.callsFake((err) => {
                expect(err).to.equal(initError);
                done();
            });

            worker.onStartCompleted(successStub, errorStub, {}, null);
        });
    });

    describe('HTTP method handlers', () => {
        beforeEach(() => {
            sandbox.stub(logger, 'debug');
            sandbox.stub(logger, 'error');
            sandbox.stub(logger, 'silly');
        });

        describe('onGet', () => {
            it('should delegate to processRequest', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));
                const restOp = makeRestOp({ method: 'GET', endpoint: 'info' });
                return worker.onGet(restOp).then(() => {
                    expect(stub.calledOnce).to.equal(true);
                });
            });
        });

        describe('onPut', () => {
            it('should delegate to processRequest', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));
                const restOp = makeRestOp({ method: 'PUT', endpoint: 'info' });
                return worker.onPut(restOp).then(() => {
                    expect(stub.calledOnce).to.equal(true);
                });
            });
        });

        describe('onDelete', () => {
            it('should delegate to processRequest', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));
                const restOp = makeRestOp({ method: 'DELETE', endpoint: 'info' });
                return worker.onDelete(restOp).then(() => {
                    expect(stub.calledOnce).to.equal(true);
                });
            });
        });

        describe('processRequest content type handling', () => {
            it('should return 400 when body is invalid JSON and content type is not application/json', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 400, body: {} }));
                const restOp = makeRestOp({
                    method: 'GET',
                    endpoint: 'info',
                    contentType: 'text/plain',
                    body: 'not valid json{'
                });
                worker.processRequest(restOp);
                expect(stub.calledWith(
                    restOp, 400,
                    sinon.match({ message: sinon.match('Invalid request body') })
                )).to.equal(true);
            });
        });

        describe('declare endpoint', () => {
            it('should return 405 for unsupported method on declare', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 405, body: {} }));
                const restOp = makeRestOp({ method: 'DELETE', endpoint: 'declare' });
                worker.processRequest(restOp);
                expect(stub.calledWith(restOp, 405)).to.equal(true);
            });

            it('should handle GET /declare error path', () => {
                sandbox.stub(configWorker, 'getConfig').rejects(new Error('config retrieval failed'));
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({ method: 'GET', endpoint: 'declare' });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('config retrieval failed') })
                    )).to.equal(true);
                });
            });

            it('should handle POST /declare error path', () => {
                sandbox.stub(configWorker, 'processConfigRequest').rejects(new Error('config processing failed'));
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'declare', body: {} });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('config processing failed') })
                    )).to.equal(true);
                });
            });

            it('should handle POST /declare with telemetry send failure gracefully', () => {
                const config = {
                    environment: 'azure',
                    externalStorage: {
                        scopingTags: { f5_cloud_failover_label: 'test' }
                    }
                };
                sandbox.stub(configWorker, 'processConfigRequest').resolves(config);
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'setStateFileName');
                const mockCloudProvider = {
                    init: sandbox.stub().resolves(),
                    customerId: 'test-customer',
                    getRegion: sandbox.stub().returns('us-east-1')
                };
                sandbox.stub(CloudFactory, 'getCloudProvider').returns(mockCloudProvider);
                sandbox.stub(TelemetryClient.prototype, 'send').rejects(new Error('telemetry failed'));
                sandbox.stub(TelemetryClient.prototype, 'createTelemetryData').returns({});
                sandbox.stub(worker, 'initFailoverInterval');

                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'declare', body: config });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 200,
                        sinon.match({ message: 'success' })
                    )).to.equal(true);
                });
            });

            it('should skip telemetry when storageDnsName and ec2DnsName are set', () => {
                const config = {
                    environment: 'azure',
                    externalStorage: {
                        scopingTags: { f5_cloud_failover_label: 'test' },
                        endpointDnsName: 'storage.dns.name'
                    },
                    failoverAddresses: {
                        endpointDnsName: 'ec2.dns.name'
                    }
                };
                sandbox.stub(configWorker, 'processConfigRequest').resolves(config);
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'setStateFileName');
                const mockCloudProvider = {
                    init: sandbox.stub().resolves(),
                    customerId: 'test-customer',
                    getRegion: sandbox.stub().returns('us-east-1')
                };
                sandbox.stub(CloudFactory, 'getCloudProvider').returns(mockCloudProvider);
                const telemetrySendStub = sandbox.stub(TelemetryClient.prototype, 'send').resolves();
                sandbox.stub(worker, 'initFailoverInterval');

                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'declare', body: config });
                return worker.processRequest(restOp).then(() => {
                    expect(telemetrySendStub.called).to.equal(false);
                    expect(stub.calledWith(
                        restOp, 200,
                        sinon.match({ message: 'success' })
                    )).to.equal(true);
                });
            });

            it('should set custom stateFileName when provided in config', () => {
                const config = {
                    environment: 'azure',
                    externalStorage: {
                        scopingTags: { f5_cloud_failover_label: 'test' },
                        stateFileName: 'my-custom-state.json'
                    }
                };
                sandbox.stub(configWorker, 'processConfigRequest').resolves(config);
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                const setStateFileNameStub = sandbox.stub(FailoverClient.prototype, 'setStateFileName');
                const mockCloudProvider = {
                    init: sandbox.stub().resolves(),
                    customerId: 'test-customer',
                    getRegion: sandbox.stub().returns('us-east-1')
                };
                sandbox.stub(CloudFactory, 'getCloudProvider').returns(mockCloudProvider);
                sandbox.stub(TelemetryClient.prototype, 'send').resolves();
                sandbox.stub(TelemetryClient.prototype, 'createTelemetryData').returns({});
                sandbox.stub(worker, 'initFailoverInterval');

                sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'declare', body: config });
                return worker.processRequest(restOp).then(() => {
                    // Called once with default, then once with custom
                    expect(setStateFileNameStub.callCount).to.equal(2);
                    expect(setStateFileNameStub.getCall(0).args[0]).to.equal(constants.STATE_FILE_NAME);
                    expect(setStateFileNameStub.getCall(1).args[0]).to.equal('my-custom-state.json');
                });
            });
        });

        describe('trigger endpoint', () => {
            it('should return 405 for unsupported method on trigger', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 405, body: {} }));
                const restOp = makeRestOp({ method: 'DELETE', endpoint: 'trigger' });
                worker.processRequest(restOp);
                expect(stub.calledWith(restOp, 405)).to.equal(true);
            });

            it('should handle POST /trigger dry-run error path', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'dryRun').rejects(new Error('dry-run failed'));
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({
                    method: 'POST',
                    endpoint: 'trigger',
                    body: { action: 'dry-run' }
                });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('dry-run failed') })
                    )).to.equal(true);
                });
            });

            it('should handle GET /trigger error path', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'getTaskStateFile').rejects(new Error('task state error'));
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({ method: 'GET', endpoint: 'trigger' });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('task state error') })
                    )).to.equal(true);
                });
            });

            it('should handle POST /trigger with RUNNING task state (already executing)', () => {
                const hostname = 'bigip1.local';
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'getTaskStateFile')
                    .onFirstCall().resolves({
                        taskState: constants.FAILOVER_STATES.RUN,
                        instance: hostname
                    })
                    .onSecondCall()
                    .resolves({
                        taskState: constants.FAILOVER_STATES.RUN,
                        instance: hostname
                    });
                sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname });
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 202, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'trigger' });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 202,
                        sinon.match({ taskState: constants.FAILOVER_STATES.RUN })
                    )).to.equal(true);
                });
            });

            it('should handle POST /trigger with error and restOperation present', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
                    taskState: constants.FAILOVER_STATES.PASS
                });
                sandbox.stub(FailoverClient.prototype, 'execute').rejects(new Error('execute failed'));
                sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'other' });
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'trigger' });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('execute failed') })
                    )).to.equal(true);
                });
            });
        });

        describe('reset endpoint', () => {
            it('should return 405 for non-POST method on reset', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 405, body: {} }));
                const restOp = makeRestOp({ method: 'GET', endpoint: 'reset' });
                worker.processRequest(restOp);
                expect(stub.calledWith(restOp, 405)).to.equal(true);
            });

            it('should handle POST /reset error path', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'resetFailoverState').rejects(new Error('reset failed'));
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({ method: 'POST', endpoint: 'reset', body: {} });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('reset failed') })
                    )).to.equal(true);
                });
            });
        });

        describe('inspect endpoint', () => {
            it('should return 405 for non-GET method on inspect', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 405, body: {} }));
                const restOp = makeRestOp({ method: 'POST', endpoint: 'inspect' });
                worker.processRequest(restOp);
                expect(stub.calledWith(restOp, 405)).to.equal(true);
            });

            it('should handle GET /inspect error path', () => {
                sandbox.stub(FailoverClient.prototype, 'init').resolves();
                sandbox.stub(FailoverClient.prototype, 'getFailoverStatusAndObjects').rejects(new Error('inspect failed'));
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 500, body: {} }));

                const restOp = makeRestOp({ method: 'GET', endpoint: 'inspect' });
                return worker.processRequest(restOp).then(() => {
                    expect(stub.calledWith(
                        restOp, 500,
                        sinon.match({ message: sinon.match('inspect failed') })
                    )).to.equal(true);
                });
            });
        });

        describe('info endpoint', () => {
            it('should return version info on GET /info', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 200, body: {} }));

                const restOp = makeRestOp({ method: 'GET', endpoint: 'info' });
                worker.processRequest(restOp);
                expect(stub.calledWith(
                    restOp, 200,
                    sinon.match({
                        version: constants.VERSION,
                        schemaCurrent: schemaUtils.getCurrentVersion(),
                        schemaMinimum: schemaUtils.getMinimumVersion()
                    })
                )).to.equal(true);
            });
        });

        describe('invalid endpoint', () => {
            it('should return 400 for unknown endpoint', () => {
                const stub = sandbox.stub(util, 'restOperationResponder')
                    .returns(Promise.resolve({ status: 400, body: {} }));
                const restOp = makeRestOp({ method: 'GET', endpoint: 'unknown' });
                worker.processRequest(restOp);
                expect(stub.calledWith(restOp, 400)).to.equal(true);
            });
        });
    });

    describe('initFailoverInterval', () => {
        it('should clear existing interval when already set', () => {
            const fakeInterval = setInterval(() => {}, 999999);
            worker.retryInterval = fakeInterval;
            const clearSpy = sandbox.spy(global, 'clearInterval');

            worker.initFailoverInterval({});

            expect(clearSpy.calledWith(fakeInterval)).to.equal(true);
            expect(worker.retryInterval).to.equal(null);
            clearInterval(fakeInterval); // cleanup
        });

        it('should set interval when retryFailover is enabled', () => {
            worker.initFailoverInterval({
                retryFailover: {
                    enabled: true,
                    interval: 1
                }
            });

            expect(worker.retryInterval).to.not.equal(null);
            clearInterval(worker.retryInterval); // cleanup
        });

        it('should set retryInterval to null when retryFailover is not enabled', () => {
            worker.retryInterval = 'something';
            worker.initFailoverInterval({ retryFailover: { enabled: false } });
            expect(worker.retryInterval).to.equal(null);
        });

        it('should set retryInterval to null when config has no retryFailover', () => {
            worker.initFailoverInterval({});
            expect(worker.retryInterval).to.equal(null);
        });
    });

    describe('performFailover (via POST /trigger)', () => {
        beforeEach(() => {
            sandbox.stub(logger, 'debug');
            sandbox.stub(logger, 'error');
            sandbox.stub(logger, 'silly');
        });

        it('should execute failover with callerAttributes when triggered via POST /trigger', () => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile')
                .resolves({ taskState: constants.FAILOVER_STATES.PASS });
            sandbox.stub(FailoverClient.prototype, 'execute').resolves();
            sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'host1' });
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 200, body: {} }));

            const restOp = makeRestOp({ method: 'POST', endpoint: 'trigger' });
            return worker.processRequest(restOp).then(() => {
                // execute should have been called with callerAttributes
                expect(FailoverClient.prototype.execute.calledWith(
                    sinon.match({ callerAttributes: sinon.match({ endpoint: 'trigger', httpMethod: 'POST' }) })
                )).to.equal(true);
                expect(stub.calledOnce).to.equal(true);
            });
        });

        it('should handle POST /trigger resulting in RUN status code 202', () => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile')
                .onFirstCall()
                .resolves({ taskState: constants.FAILOVER_STATES.PASS })
                .onSecondCall()
                .resolves({ taskState: constants.FAILOVER_STATES.RUN });
            sandbox.stub(FailoverClient.prototype, 'execute').resolves();
            sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'host1' });
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 202, body: {} }));

            const restOp = makeRestOp({ method: 'POST', endpoint: 'trigger' });
            return worker.processRequest(restOp).then(() => {
                expect(stub.calledWith(
                    restOp, 202, sinon.match({ taskState: constants.FAILOVER_STATES.RUN })
                )).to.equal(true);
            });
        });

        it('should handle POST /trigger resulting in NEVER_RUN status code 200', () => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile')
                .onFirstCall()
                .resolves({ taskState: constants.FAILOVER_STATES.PASS })
                .onSecondCall()
                .resolves({ taskState: constants.FAILOVER_STATES.NEVER_RUN });
            sandbox.stub(FailoverClient.prototype, 'execute').resolves();
            sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'host1' });
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 200, body: {} }));

            const restOp = makeRestOp({ method: 'POST', endpoint: 'trigger' });
            return worker.processRequest(restOp).then(() => {
                expect(stub.calledWith(
                    restOp, 200, sinon.match({ taskState: constants.FAILOVER_STATES.NEVER_RUN })
                )).to.equal(true);
            });
        });

        it('should map unknown taskState to 500 in mapStatusToCode', () => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile')
                .onFirstCall()
                .resolves({ taskState: constants.FAILOVER_STATES.PASS })
                .onSecondCall()
                .resolves({ taskState: 'UNKNOWN_STATE' });
            sandbox.stub(FailoverClient.prototype, 'execute').resolves();
            sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'host1' });
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 500, body: {} }));

            const restOp = makeRestOp({ method: 'POST', endpoint: 'trigger' });
            return worker.processRequest(restOp).then(() => {
                expect(stub.calledWith(
                    restOp, 500, sinon.match({ taskState: 'UNKNOWN_STATE' })
                )).to.equal(true);
            });
        });

        it('should handle GET /trigger with RUNNING status returning 202', () => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
                taskState: constants.FAILOVER_STATES.RUN
            });
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 202, body: {} }));

            const restOp = makeRestOp({ method: 'GET', endpoint: 'trigger' });
            return worker.processRequest(restOp).then(() => {
                expect(stub.calledWith(
                    restOp, 202, sinon.match({ taskState: constants.FAILOVER_STATES.RUN })
                )).to.equal(true);
            });
        });

        it('should handle GET /trigger with NEVER_RUN status returning 200', () => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
                taskState: constants.FAILOVER_STATES.NEVER_RUN
            });
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 200, body: {} }));

            const restOp = makeRestOp({ method: 'GET', endpoint: 'trigger' });
            return worker.processRequest(restOp).then(() => {
                expect(stub.calledWith(
                    restOp, 200, sinon.match({ taskState: constants.FAILOVER_STATES.NEVER_RUN })
                )).to.equal(true);
            });
        });

        it('should handle failover from interval without restOperation (execute without callerAttributes)', (done) => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
                taskState: constants.FAILOVER_STATES.PASS
            });
            const executeStub = sandbox.stub(FailoverClient.prototype, 'execute').resolves();
            sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'host1' });

            // Capture the callback passed to setInterval so we can invoke performFailover
            // with no arguments, simulating the timer-based retry path.
            const origSetInterval = global.setInterval;
            let capturedCallback = null;
            sandbox.stub(global, 'setInterval').callsFake((fn) => {
                capturedCallback = fn;
                return origSetInterval(() => {}, 999999); // return a real interval handle
            });

            worker.initFailoverInterval({
                retryFailover: {
                    enabled: true,
                    interval: 1
                }
            });

            expect(capturedCallback).to.not.equal(null);

            // Call the captured callback (performFailover with no args)
            const result = capturedCallback();
            result.then((taskState) => {
                expect(executeStub.calledOnce).to.equal(true);
                // Should be called with no arguments (no callerAttributes)
                expect(executeStub.firstCall.args.length).to.equal(0);
                // Should return taskState directly (no restOperation)
                expect(taskState).to.deep.equal({ taskState: constants.FAILOVER_STATES.PASS });
                clearInterval(worker.retryInterval);
                done();
            }).catch((err) => {
                clearInterval(worker.retryInterval);
                done(err);
            });
        });

        it('should handle failover from interval error path without restOperation', (done) => {
            sandbox.stub(FailoverClient.prototype, 'init').resolves();
            sandbox.stub(FailoverClient.prototype, 'getTaskStateFile').resolves({
                taskState: constants.FAILOVER_STATES.PASS
            });
            sandbox.stub(FailoverClient.prototype, 'execute').rejects(new Error('interval exec fail'));
            sandbox.stub(Device.prototype, 'getGlobalSettings').resolves({ hostname: 'host1' });

            const origSetInterval = global.setInterval;
            let capturedCallback = null;
            sandbox.stub(global, 'setInterval').callsFake((fn) => {
                capturedCallback = fn;
                return origSetInterval(() => {}, 999999);
            });

            worker.initFailoverInterval({
                retryFailover: {
                    enabled: true,
                    interval: 1
                }
            });

            const result = capturedCallback();
            result.then(() => {
                clearInterval(worker.retryInterval);
                done(new Error('Expected rejection'));
            }).catch((err) => {
                expect(err.message).to.equal('interval exec fail');
                clearInterval(worker.retryInterval);
                done();
            });
        });
    });

    describe('processRequest edge cases', () => {
        beforeEach(() => {
            sandbox.stub(logger, 'debug');
            sandbox.stub(logger, 'error');
            sandbox.stub(logger, 'silly');
        });

        it('should handle empty content type string (falsy toLowerCase result)', () => {
            const stub = sandbox.stub(util, 'restOperationResponder')
                .returns(Promise.resolve({ status: 200, body: {} }));
            const restOp = makeRestOp({
                method: 'GET',
                endpoint: 'info',
                contentType: ''
            });
            // getContentType returns '' which is falsy, triggering the || '' branch
            worker.processRequest(restOp);
            expect(stub.calledOnce).to.equal(true);
        });
    });
});
