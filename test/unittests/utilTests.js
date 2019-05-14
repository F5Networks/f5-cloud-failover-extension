/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */
'use strict';

const assert = require('assert');

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
    MockRestOperation.prototype.complete = function () {};

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
});
