/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon');

/* eslint-disable global-require */

describe('Util', () => {
    let util;

    before(() => {
        util = require('../../src/nodejs/util.js');
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
            const fakeFuncSpy = sinon.stub().resolves();

            return util.retrier(fakeFuncSpy, [], { maxRetries: 10, retryInterval: 10 })
                .then(() => {
                    assert.strictEqual(fakeFuncSpy.callCount, 1);
                })
                .catch(err => Promise.reject(err));
        });

        it('should validate reject', () => {
            const fakeFuncSpy = sinon.stub().rejects();
            const retryCount = 2;

            return util.retrier(fakeFuncSpy, [], { maxRetries: retryCount, retryInterval: 10 })
                .then(() => {
                    assert.fail(); // should reject
                })
                .catch(() => {
                    assert.strictEqual(fakeFuncSpy.callCount, retryCount + 1);
                });
        });
    });
});
