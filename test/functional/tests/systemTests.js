/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const path = require('path');
const assert = require('assert');

const utils = require('../../shared/util.js');

const deploymentFile = process.env.CF_DEPLOYMENT_FILE || path.join(process.cwd(), 'deployment_info.json');

/* eslint-disable global-require */

/**
 * Get host info
 *
 * @returns {Object} Returns [ { ip: x.x.x.x, username: admin, password: admin } ]
 */
function getHostInfo() {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const hosts = require(deploymentFile).map((item) => {
        item = {
            ip: item.mgmt_address,
            username: item.admin_username,
            password: item.admin_password
        };
        return item;
    });
    return hosts;
}

const duts = getHostInfo();
const dutPrimary = duts[0];
// const dutSecondary = duts[1];

describe(`DUT - ${dutPrimary.ip}`, () => {
    const dutHost = dutPrimary.ip;
    const dutUser = dutPrimary.username;
    const dutPassword = dutPrimary.password;

    let authToken = null;

    before(() => {
    });
    beforeEach(() => utils.getAuthToken(dutHost, dutUser, dutPassword)
        .then((data) => {
            authToken = data.token;
        }));
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should have auth token', () => {
        assert.notStrictEqual(authToken, null);
    });
});
