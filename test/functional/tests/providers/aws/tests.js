/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const AWS = require('aws-sdk');

const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const RETRIES = {
    LONG: 500,
    MEDIUM: 100,
    SHORT: 10
};

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();

describe('Provider: AWS', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];
    let virtualAddresses = [];

    before(function () {
        this.timeout(10000);

        AWS.config.update({ region: deploymentInfo.region });
        this.ec2 = new AWS.EC2();

        return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutPrimary.ip, '/mgmt/tm/ltm/virtual-address', options);
            })
            .then((data) => {
                virtualAddresses = data.items.map(i => i.address.split('/')[0]);
                return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password);
            })
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutPrimary.ip, '/mgmt/tm/net/self', options);
            })
            .then((data) => {
                primarySelfIps = data.items.map(i => i.address.split('/')[0]);
                return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password);
            })
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutSecondary.ip, '/mgmt/tm/net/self', options);
            })
            .then((data) => {
                secondarySelfIps = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('init test', () => {
    });
});
