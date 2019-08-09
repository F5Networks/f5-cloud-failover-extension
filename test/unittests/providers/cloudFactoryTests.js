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

describe('Cloud Factory', () => {
    let CloudFactory;

    before(() => {
        CloudFactory = require('../../../src/nodejs/providers/cloudFactory.js');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should get azure cloud provider', () => {
        const cloud = 'azure';
        const provider = CloudFactory.getCloudProvider(cloud);

        assert.strictEqual(provider.environment, cloud);
    });

    it('should get aws cloud provider', () => {
        const cloud = 'aws';
        const provider = CloudFactory.getCloudProvider(cloud);

        assert.strictEqual(provider.environment, cloud);
    });

    it('should get cloud provider', () => {
        const provider = CloudFactory.getCloudProvider('gce');

        assert.strictEqual(provider.environment, 'gce');
    });

    it('should get cloud provider', () => {
        assert.throws(
            () => {
                CloudFactory.getCloudProvider('foo');
            },
            (err) => {
                if (err.message.includes('Unsupported cloud')) {
                    return true;
                }
                return false;
            },
            'unexpected error'
        );
    });
});
