/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const utils = require('../../../../shared/util.js');

const duts = utils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

describe('Provider: Azure', () => {
    let primarySelfIps = [];

    before(() => {
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should get BIG-IP (primary) self IP(s)', () => {
        const uri = '/mgmt/tm/net/self';

        return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
            .then((data) => {
                const options = {
                    headers: {
                        'x-f5-auth-token': data.token
                    }
                };
                return utils.makeRequest(dutPrimary.ip, uri, options);
            })
            .then((data) => {
                primarySelfIps = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('should check Azure UDR route next hop matches self IP (primary)', () => {

    });

    it('should trigger failover', () => {

    });

    it('should get BIG-IP (secondary) self IP(s)', () => {

    });

    it('should check Azure UDR route next hop matches self IP (secondary)', () => {

    });
});
