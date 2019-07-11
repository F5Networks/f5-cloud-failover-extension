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

    let mockBigIpInit;
    let mockBigIpCreate;

    before(() => {
        config = require('../../src/nodejs/config.js');
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');
        mockBigIpInit = sinon.stub(f5CloudLibs.bigIp.prototype, 'init').returns();
        mockBigIpCreate = sinon.stub(f5CloudLibs.bigIp.prototype, 'create').returns();
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should process request', () => config.init(restWorker)
        .then(() => config.processConfigRequest(declaration))
        .then((response) => {
            assert.strictEqual(mockBigIpCreate.called, true);
            assert.strictEqual(response.class, declaration.class);
        }));

    it('should reject invalid declaration', () => config.init(restWorker)
        .then(() => config.processConfigRequest({ foo: 'bar' }))
        .then(() => {
            assert.fail('Should throw an error');
        })
        .catch((err) => {
            if (err.message.includes('Invalid declaration')) return Promise.resolve();

            return Promise.reject(err);
        }));

    it('should initialize a bigip', () => {
        mockBigIpInit.reset();
        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => {
                assert.strictEqual(mockBigIpInit.called, true);
                assert.deepStrictEqual(mockBigIpInit.args[0], ['localhost', 'admin', 'admin', {
                    port: '443',
                    product: 'BIG-IP'
                }]);
            });
    });

    it('should generate failover trigger bash scripts', () => config.init(restWorker)
        .then(() => config.generateTriggerScript('test'))
        .then((response) => {
            const cmdParts = response.split('\n');
            const quoteFunc = cmdParts[0].split('&&')[0];
            const curlCmds = cmdParts[2].split('Authorization: ')[1].split('$(sq) ');
            const redirection = cmdParts[3].split('> ')[1];

            assert.strictEqual(curlCmds[0], 'Basic YWRtaW46YWRtaW4=');
            assert.strictEqual(curlCmds[1], 'localhost:8100/mgmt/shared/cloud-failover/trigger');
            assert.strictEqual(redirection, "/config/failover/test'");
            assert.strictEqual(quoteFunc, "'function sq() { printf 27 | xxd -r -p; } ");
        }));

    it('should post failover script to iControl bash endpoint', () => {
        mockBigIpCreate.reset();
        return config.init(restWorker)
            .then(() => {
                sinon.stub(Object.getPrototypeOf(config), 'generateTriggerScript').returns('hello');
                config.processConfigRequest(declaration);
            })
            .then(() => {
                const expectedBashCmd = {
                    command: 'run',
                    utilCmdArgs: '-c hello'
                };
                assert.strictEqual(mockBigIpCreate.args[0][0], '/tm/util/bash');
                assert.deepStrictEqual(mockBigIpCreate.args[0][1], expectedBashCmd);
            });
    });

    it('should get config', () => config.init(restWorker)
        .then(() => config.processConfigRequest(declaration))
        .then(() => config.getConfig())
        .then((response) => {
            assert.strictEqual(response.class, declaration.class);
        }));
});
