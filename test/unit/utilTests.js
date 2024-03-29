/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon');
const nock = require('nock');

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

    it('should validate ipv6 address', () => {
        const invalidAddress = '5.5.5.5';
        const ipv6Address = '2600:1f13:fa5:c004:72ec:d73:3fda:3094';

        assert.deepEqual(util.validateIpv6Address(invalidAddress), false);
        assert.deepEqual(util.validateIpv6Address(ipv6Address), true);
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
                .catch((err) => Promise.reject(err));
        });

        it('should validate reject', () => {
            const fakeFuncSpy = sinon.stub().rejects();
            const retryCount = 2;

            return util.retrier(fakeFuncSpy, [], { maxRetries: retryCount, retryInterval: 10 })
                .catch(() => {
                    assert.strictEqual(fakeFuncSpy.callCount, retryCount + 1);
                });
        });
    });

    describe('makeRequest', () => {
        after(() => {
            nock.cleanAll();
        });

        it('should validate resolve with form data', () => {
            nock('https://localhost')
                .get('/path/to/endpoint')
                .reply(200, {
                    message: 'reponseData'
                });

            const options = {
                formData: [
                    {
                        name: 'name',
                        data: {
                            type: 'form'
                        },
                        fileName: 'foo',
                        contentType: 'bar'
                    }
                ]
            };

            return util.makeRequest('localhost', '/path/to/endpoint', options)
                .then((response) => {
                    assert.deepStrictEqual(response, { message: 'reponseData' });
                })
                .catch((err) => Promise.reject(err));
        });

        it('should validate resolve advanced return', () => {
            nock('https://localhost')
                .get('/path/to/endpoint')
                .reply(200, {
                    message: 'reponseData'
                });

            return util.makeRequest('localhost', '/path/to/endpoint', { advancedReturn: true })
                .then((response) => {
                    assert.deepStrictEqual(response, { body: { message: 'reponseData' }, code: 200, headers: { 'content-type': 'application/json' } });
                })
                .catch((err) => Promise.reject(err));
        });

        it('should validate reject', () => {
            nock('https://localhost')
                .get('/path/to/endpoint')
                .reply(404, {
                    message: 'File Not Found'
                });

            return util.makeRequest('localhost', '/path/to/endpoint', {})
                .then(() => {
                    assert.fail(); // should reject
                })
                .catch((e) => {
                    assert.match(e.toString(), /^"HTTP request failed: 404 {\\"message\\":\\"File Not Found\\"}"/);
                });
        });
    });
});
