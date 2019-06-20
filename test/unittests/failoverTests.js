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
const constants = require('../constants.js');

const declaration = constants.declarations.basic;
const restWorker = constants.restWorker;

/* eslint-disable global-require */

describe('Failover', () => {
    let config;
    let failover;
    let CloudFactory;
    let f5CloudLibs;

    before(() => {
        config = require('../../src/nodejs/config.js');
        failover = require('../../src/nodejs/failover.js');
        CloudFactory = require('../../src/nodejs/providers/cloudFactory.js');
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should perform failover', () => {
        const mockCloudProvider = {
            init: () => {},
            updateAddresses: () => {}
        };
        const mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(mockCloudProvider);
        const mockBigIpInit = sinon.stub(f5CloudLibs.bigIp.prototype, 'init').returns();
        const mockBigIpList = sinon.stub(f5CloudLibs.bigIp.prototype, 'list');
        mockBigIpList.onCall(0).returns({ hostname: 'foo' });
        mockBigIpList.returns([]);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                assert.strictEqual(mockCloudFactory.called, true);
                assert.strictEqual(mockBigIpInit.called, true);
                assert.strictEqual(mockBigIpList.called, true);
            })
            .catch(err => Promise.reject(err));
    });
});
