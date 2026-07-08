/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const chai = require('chai');
const sinon = require('sinon');
const axios = require('axios');
const https = require('https');
const FormData = require('form-data');
const util = require('../../src/nodejs/util');

const { expect } = chai;
/* eslint-disable no-unused-expressions */

describe('util.makeRequest', () => {
    let axiosRequestStub;

    beforeEach(() => {
        axiosRequestStub = sinon.stub(axios, 'request');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should make a GET request and return response data', () => {
        axiosRequestStub.resolves({
            status: 200,
            data: { foo: 'bar' },
            headers: { 'x-test': 'header' }
        });

        return util.makeRequest('localhost', '/test', {})
            .then((result) => {
                expect(result).to.deep.equal({ foo: 'bar' });

                expect(axiosRequestStub.calledOnce).to.be.true;
                const callArgs = axiosRequestStub.firstCall.args[0];
                expect(callArgs.method).to.equal('GET');
                expect(callArgs.baseURL).to.equal('https://localhost:443');
            });
    });

    it('should make a POST request with body', () => {
        axiosRequestStub.resolves({
            status: 201,
            data: { created: true },
            headers: {}
        });

        const options = {
            method: 'POST',
            body: JSON.stringify({ name: 'test' })
        };
        return util.makeRequest('localhost', '/create', options)
            .then((result) => {
                expect(result).to.deep.equal({ created: true });
                expect(axiosRequestStub.firstCall.args[0].method).to.equal('POST');
                expect(axiosRequestStub.firstCall.args[0].data).to.equal(options.body);
            });
    });

    it('should handle formData and set headers', () => {
        axiosRequestStub.resolves({
            status: 200,
            data: { ok: true },
            headers: {}
        });

        const fakeFormData = [
            {
                name: 'file', data: 'abc', fileName: 'test.txt', contentType: 'text/plain'
            }
        ];

        // stub FormData.prototype.append and getHeaders
        const appendStub = sinon.stub(FormData.prototype, 'append');
        const getHeadersStub = sinon.stub(FormData.prototype, 'getHeaders').returns({ 'content-type': 'multipart/form-data' });

        const options = { formData: fakeFormData, headers: {} };
        return util.makeRequest('localhost', '/upload', options)
            .then(() => {
                expect(appendStub.calledOnce).to.be.true;
                expect(getHeadersStub.calledOnce).to.be.true;
                appendStub.restore();
                getHeadersStub.restore();
            });
    });

    it('should reject on HTTP error status', () => {
        axiosRequestStub.resolves({
            status: 404,
            data: { error: 'not found' },
            headers: {}
        });

        return util.makeRequest('localhost', '/notfound', {})
            .then(() => {
                throw new Error('Should have thrown');
            })
            .catch((err) => {
                expect(err.message).to.include('HTTP request failed: 404');
            });
    });

    it('should continue on error if continueOnError is true', () => {
        axiosRequestStub.resolves({
            status: 404,
            data: { error: 'not found' },
            headers: {}
        });

        return util.makeRequest('localhost', '/notfound', { continueOnError: true })
            .then((result) => {
                expect(result).to.deep.equal({ error: 'not found' });
            });
    });

    it('should return advanced return if advancedReturn is true', () => {
        axiosRequestStub.resolves({
            status: 200,
            data: { foo: 'bar' },
            headers: { 'x-test': 'header' }
        });

        return util.makeRequest('localhost', '/test', { advancedReturn: true })
            .then((result) => {
                expect(result).to.deep.equal({
                    code: 200,
                    body: { foo: 'bar' },
                    headers: { 'x-test': 'header' }
                });
            });
    });

    it('should reject with error message on axios error', () => {
        axiosRequestStub.rejects(new Error('Network error'));

        return util.makeRequest('localhost', '/fail', {})
            .then(() => {
                throw new Error('Should have thrown');
            })
            .catch((err) => {
                expect(err.message).to.include('Network error');
            });
    });

    it('should use custom httpsAgent if provided', () => {
        axiosRequestStub.resolves({
            status: 200,
            data: {},
            headers: {}
        });

        const customAgent = new https.Agent({ rejectUnauthorized: true });
        return util.makeRequest('localhost', '/test', { httpsAgent: customAgent })
            .then(() => {
                expect(axiosRequestStub.firstCall.args[0].httpsAgent).to.equal(customAgent);
            });
    });

    it('should use custom proxy if provided', () => {
        axiosRequestStub.resolves({
            status: 200,
            data: {},
            headers: {}
        });

        const proxy = { host: 'proxyhost', port: 8080 };
        return util.makeRequest('localhost', '/test', { proxy })
            .then(() => {
                expect(axiosRequestStub.firstCall.args[0].proxy).to.deep.equal(proxy);
            });
    });

    it('should use custom validateStatus if provided', () => {
        axiosRequestStub.resolves({
            status: 200,
            data: {},
            headers: {}
        });

        return util.makeRequest('localhost', '/test', { validateStatus: true })
            .then(() => {
                expect(axiosRequestStub.firstCall.args[0].validateStatus).to.equal(true);
            });
    });
});

describe('getIPsFromCIDR', () => {
    it('should return all IPs for a valid CIDR', () => {
        const testData = [
            { cidr: '2001:db8::/126', expected: ['2001:db8::', '2001:db8::1', '2001:db8::2', '2001:db8::3'] },
            { cidr: '2001:db8::1/128', expected: ['2001:db8::1'] },
            { cidr: '192.168.1.0/30', expected: ['192.168.1.0', '192.168.1.1', '192.168.1.2', '192.168.1.3'] },
            { cidr: '10.0.0.0/30', expected: ['10.0.0.0', '10.0.0.1', '10.0.0.2', '10.0.0.3'] },
            { cidr: '255.255.255.255/32', expected: ['255.255.255.255'] }
        ];
        return Promise.all(testData.map((data) => util.getIPsFromCIDR(data.cidr)
            .then((ips) => {
                assert.deepStrictEqual(ips, data.expected);
            })));
    });

    it('should reject invalid CIDR blocks', () => {
        const invalidInputs = ['badinput', '192.168.1.1/33', '192.168.1.1/-1', '192.168.1.1/abc', 123, {}, [], null];
        return Promise.all(invalidInputs.map((input) => util.getIPsFromCIDR(input)
            .then(() => {
                assert.fail(`Expected rejection for invalid CIDR: ${JSON.stringify(input)}`);
            })
            .catch((err) => {
                assert.ok(/Invalid CIDR block/.test(err.message), `unexpected error: ${err.message}`);
            })));
    });
});

describe('_expandCIDR', () => {
    it('should expand valid IPv4 and IPv6 CIDR blocks', () => {
        assert.deepStrictEqual(util._expandCIDR('192.0.2.0/30'), ['192.0.2.0', '192.0.2.1', '192.0.2.2', '192.0.2.3']);
        assert.deepStrictEqual(util._expandCIDR('2001:db8::/126'), ['2001:db8::', '2001:db8::1', '2001:db8::2', '2001:db8::3']);
    });

    it('should throw for invalid input even when called directly', () => {
        // _expandCIDR must not rely on the isCidr guard in getIPsFromCIDR;
        // ip-address flags malformed input as invalid rather than throwing
        assert.throws(() => util._expandCIDR('not-a-cidr'), /Invalid CIDR block/);
        assert.throws(() => util._expandCIDR('192.0.2.0/99'), /Invalid CIDR block/);
    });
});

describe('base64', () => {
    it('should encode data', () => {
        assert.strictEqual(util.base64('encode', 'hello'), 'aGVsbG8=');
    });

    it('should decode data', () => {
        assert.strictEqual(util.base64('decode', 'aGVsbG8='), 'hello');
    });

    it('should throw for an unsupported action', () => {
        // any action other than encode|decode reaches the throw branch
        assert.throws(
            () => util.base64('unsupported', 'data'),
            /Unsupported action, try one of these: decode, encode/
        );
    });
});
