/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line import/no-extraneous-dependencies

/* eslint-disable global-require */

describe('Util', () => {
    let util;
    let cloudLibsUtil;

    before(() => {
        util = require('../../src/nodejs/util.js');
        cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    function MockRestOperation() {
        this.method = null;
        this.body = null;
        this.statusCode = null;
    }
    MockRestOperation.prototype.setMethod = function (method) { this.method = method; };
    MockRestOperation.prototype.setBody = function (body) { this.body = body; };
    MockRestOperation.prototype.setStatusCode = function (code) { this.statusCode = code; };
    MockRestOperation.prototype.complete = function () { };

    it('should stringify object', () => {
        const obj = {
            foo: 'bar'
        };
        const newObj = util.stringify(obj);
        assert.notStrictEqual(newObj.indexOf('{"foo":"bar"}'), -1);
    });

    it('should leave string intact', () => {
        const obj = 'foo';
        const newObj = util.stringify(obj);
        assert.strictEqual(obj, newObj);
    });

    it('should call rest operation responder', () => {
        const mockRestOperation = new MockRestOperation();

        const body = { foo: 'bar' };
        const statusCode = 200;
        util.restOperationResponder(mockRestOperation, statusCode, body);
        assert.strictEqual(mockRestOperation.body, body);
        assert.strictEqual(mockRestOperation.statusCode, statusCode);
    });

    describe('retrier', () => {
        it('should validate resolve', () => {
            const fakeFunc = () => Promise.resolve();
            return util.retrier(fakeFunc, { key01: 'value01', key02: 'value02' })
                .then(() => {
                    assert.ok(true);
                })
                .catch(() => {
                    // fails when error recieved
                    assert.fail();
                });
        });

        it('should validate reject', () => {
            cloudLibsUtil.tryUntil = sinon.stub().rejects();
            const fakeFunc = () => 'fake func return';
            return util.retrier(fakeFunc, { key01: 'value01', key02: 'value02' })
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    // fails when error recieved
                    assert.ok(true);
                });
        });

        it('should accept custom retryOptions', () => {
            const fakeFunc = () => Promise.resolve();
            const customRetry = { maxRetries: 4, retryIntervalMs: 15000 };
            let retryParms;
            cloudLibsUtil.tryUntil = sinon.stub().callsFake((thisArg, retryOptions) => {
                retryParms = retryOptions;
                return Promise.resolve();
            });
            return util.retrier(fakeFunc, {}, customRetry)
                .then(() => {
                    assert.ok(true);
                    assert.deepEqual(retryParms, customRetry);
                })
                .catch(() => {
                    // fails when error recieved
                    assert.fail();
                });
        });
    });
});
