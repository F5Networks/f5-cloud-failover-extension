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
            { cidr: '255.255.255.2551/32', expected: ['255.255.255.255'] },
            { cidr: null, expected: [] }
        ];
        testData.forEach((data) => {
            util.getIPsFromCIDR(data.cidr)
                .then((ips) => {
                    assert.deepStrictEqual(ips, data.expected);
                });
        });
    });

    it('should handle invalid CIDR gracefully', () => {
        ['badinput', '192.168.1.1/33', '192.168.1.1/-1', '192.168.1.1/abc', 123, {}, []].forEach((input) => {
            util.getIPsFromCIDR(input)
                .catch((err) => {
                    assert.ok(err.message.includes('Error: Invalid CIDR block: badinput'));
                });
        });
    });
});
