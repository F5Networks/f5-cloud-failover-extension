'use strict';

const sinon = require('sinon');
const chai = require('chai');
const util = require('../../src/nodejs/util.js');
const logger = require('../../src/nodejs/logger.js');
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

    describe('onStartCompleted', () => {
        let successStub;
        let errorStub;

        beforeEach(() => {
            successStub = sandbox.stub();
            errorStub = sandbox.stub();
            sandbox.stub(worker, 'initFailoverInterval');
        });

        it('should call error callback when errMsg is provided', () => {
            worker.logger = { error: sandbox.stub() };
            worker.onStartCompleted(successStub, errorStub, {}, 'error message');

            expect(errorStub.calledOnce).to.equal(true);
            expect(successStub.called).to.equal(false);
        });
    });

    describe('processRequest', () => {
        let restOperation;
        let restOperationResponderStub;

        beforeEach(() => {
            restOperation = {
                method: 'GET',
                getUri: () => ({ pathname: '/shared/cloud-failover/info' }),
                getContentType: () => 'application/json',
                getBody: () => ({})
            };
            restOperationResponderStub = sandbox.stub(util, 'restOperationResponder');
            sandbox.stub(logger, 'debug');
            sandbox.stub(logger, 'error');
        });

        it('should handle invalid endpoint', () => {
            restOperation.getUri = () => ({ pathname: '/shared/cloud-failover/invalid' });

            worker.processRequest(restOperation);

            expect(restOperationResponderStub.calledWith(restOperation, 400)).to.equal(true);
        });

        it('should handle Method Not Allowed for declare', () => {
            restOperation.method = 'DELETE';
            restOperation.getUri = () => ({ pathname: '/shared/cloud-failover/declare' });

            worker.processRequest(restOperation);

            expect(restOperationResponderStub.calledWith(restOperation, 405)).to.equal(true);
        });
    });
});
