/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const constants = require('../constants.js');

/* eslint-disable global-require */

describe('Schema Utils', () => {
    let schemaUtils;

    before(() => {
        schemaUtils = require('../../src/nodejs/schema/schemaUtils.js');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should get current version', () => {
        const currentVersion = schemaUtils.getCurrentVersion();
        assert.strictEqual(currentVersion, constants.PKG_VERSION);
    });

    it('should get minimum version', () => {
        const currentVersion = schemaUtils.getMinimumVersion();
        assert.strictEqual(currentVersion, constants.PKG_MIN_VERSION);
    });
});
