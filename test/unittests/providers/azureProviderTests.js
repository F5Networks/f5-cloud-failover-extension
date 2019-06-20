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
const sinon = require('sinon'); // eslint-disable-line import/no-extraneous-dependencies

const cloud = 'azure';

describe('Provider - Azure', () => {
    let CloudFactory;
    let f5CloudLibs;

    const mockResourceGroup = 'foo';
    const mockSubscriptionId = 'foo';
    const mockMetadata = {
        compute: {
            resourceGroupName: mockResourceGroup,
            subscriptionId: mockSubscriptionId,
            azEnvironment: 'AzurePublicCloud'
        }
    };

    before(() => {
        CloudFactory = require('../../../src/nodejs/providers/cloudFactory.js');
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should instantiate provider', () => {
        const provider = CloudFactory.getCloudProvider(cloud);

        assert.strictEqual(provider.environment, cloud);
    });

    it('should initialize provider', () => {
        const provider = CloudFactory.getCloudProvider(cloud);

        sinon.replace(f5CloudLibs.util, 'getDataFromUrl', sinon.fake.resolves(mockMetadata));

        return provider.init()
            .then(() => {
                assert.strictEqual(provider.resourceGroup, mockResourceGroup);
                assert.strictEqual(provider.subscriptionId, mockSubscriptionId);
            })
            .catch(err => Promise.reject(err));
    });
});
