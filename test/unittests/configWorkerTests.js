/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');
const sinon = require('sinon');
const constants = require('../constants.js');

const declaration = constants.declarations.basic;
const restWorker = constants.restWorker;

describe('Config Worker', () => {
    let config;
    let f5CloudLibs;

    const mockBigIpInit;
    let mockBigIpCreate;

    before(() => {
        config = require('../../src/nodejs/config.js');
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');
        mockBigIpInit = sinon.stub(f5CloudLibs.bigIp.prototype, 'init').returns();
        mockBigIpCreate = sinon.stub(f5CloudLibs.bigIp.prototype, 'create');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should process request', () => {
        mockBigIpCreate.onCall(0).returns({ hostname: 'foo' });
        mockBigIpCreate.returns([]);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then((response) => {
                assert.strictEqual(response.class, declaration.class);
            });
    });

    it('should reject invalid declaration', () => config.init(restWorker)
        .then(() => config.processConfigRequest({ foo: 'bar' }))
        .then(() => {
            assert.fail('Should throw an error');
        })
        .catch((err) => {
            if (err.message.includes('Invalid declaration')) return Promise.resolve();

            return Promise.reject(err);
        }));

    it('should get config', () => config.init(restWorker)
        .then(() => config.processConfigRequest(declaration))
        .then(() => config.getConfig())
        .then((response) => {
            assert.strictEqual(response.class, declaration.class);
        }));
});
