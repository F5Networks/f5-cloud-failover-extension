/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const restWorker = {
    loadState: (first, cb) => { cb(null, {}); },
    saveState: (first, state, cb) => { cb(null); }
};

/* eslint-disable global-require */

xdescribe('Failover', () => {
    let config;
    let failover;

    before(() => {
        config = require('../../src/nodejs/config.js');
        failover = require('../../src/nodejs/failover.js');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('perform failover', () => config.init(restWorker)
        .then(() => failover.execute())
        .then(() => {
            assert.strictEqual(true, false);
        }));
});
