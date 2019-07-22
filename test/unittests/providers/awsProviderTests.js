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


const cloud = 'aws';

describe('Provider - AWS', () => {
    let AWSCloudProvider;
    let f5CloudLibs;
    let cloudLibsUtil;

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
    afterEach(() => {
        sinon.restore();
    });

    it('validate constructor', () => {
        const provider = new AWSCloudProvider();

        assert.strictEqual(provider.environment, cloud);
    });
});
