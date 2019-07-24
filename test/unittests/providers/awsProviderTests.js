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
const AWS = require('aws-sdk');

const cloud = 'aws';

describe('Provider - AWS', () => {
    let AWSCloudProvider;
    let f5CloudLibs;
    let cloudLibsUtil;
    let provider;
    let metadataPathRequest;

    const mockInitData = {
        tags: [
            {
                key: 'zyx',
                value: 'abc'
            }
        ]
    };

    const mockMetadata = { region: 'us-west', instanceId: 'i-123' };

    before(() => {
        AWSCloudProvider = require('../../../src/nodejs/providers/aws/cloud.js').Cloud;
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');
        cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    beforeEach(() => {
        provider = new AWSCloudProvider(mockInitData);

        provider.metadata.request = sinon.stub().callsFake((path, callback) => {
            metadataPathRequest = path;
            callback(null, JSON.stringify(mockMetadata));
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should validate constructor', () => {
        provider = new AWSCloudProvider(mockInitData);

        assert.strictEqual(provider.environment, cloud);
    });

    it('should initialize AWS provider', () => provider.init(mockInitData)
        .then(() => {
            assert.strictEqual(metadataPathRequest, '/latest/dynamic/instance-identity/document');
            assert.strictEqual(provider.region, mockMetadata.region);
            assert.strictEqual(provider.instanceId, mockMetadata.instanceId);
        })
        .catch(() => {
            // fails when error recieved
            assert.fail();
        }));
});
