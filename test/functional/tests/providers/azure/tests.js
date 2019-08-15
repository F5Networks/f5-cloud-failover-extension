/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

/* eslint-disable import/no-extraneous-dependencies */
const AzureCliCredentials = require('@azure/ms-rest-nodeauth').AzureCliCredentials;
const NetworkManagementClient = require('@azure/arm-network').NetworkManagementClient;

const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const declaration = funcUtils.getDeploymentDeclaration();

describe('Provider: Azure', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];

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
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutPrimary.ip, uri, options);
            })
            .then((data) => {
                primarySelfIps = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('should check Azure route table route(s) next hop matches self IP (primary)', () => {
        let networkClient;

        return AzureCliCredentials.create()
            .then((creds) => {
                networkClient = new NetworkManagementClient(creds, creds.tokenInfo.subscription);
                return networkClient.routeTables.listAll();
            })
            .then((routeTables) => {
                let match = false;
                // filter
                const routeTagKey = Object.keys(declaration.failoverRoutes.scopingTags)[0];
                const routeTagValue = declaration.failoverRoutes.scopingTags[routeTagKey];
                routeTables = routeTables.filter(i => i.tags
                    && Object.keys(i.tags).indexOf(routeTagKey) !== -1
                    && i.tags[routeTagKey] === routeTagValue);
                // check
                routeTables.forEach((routeTable) => {
                    routeTable.routes.forEach((route) => {
                        if (primarySelfIps.indexOf(route.nextHopIpAddress) !== -1) {
                            match = true;
                        }
                    });
                });
                // assert
                if (!match) {
                    assert.fail('Matching next hop not found');
                }
            })
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (primary) to standby', () => {
        const uri = '/mgmt/tm/sys/failover';

        return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                options.method = 'POST';
                options.body = {
                    command: 'run',
                    standby: true
                };
                return utils.makeRequest(dutPrimary.ip, uri, options);
            })
            .catch(err => Promise.reject(err));
    });

    it('should get BIG-IP (secondary) self IP(s)', () => {
        const uri = '/mgmt/tm/net/self';

        return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
            .then((data) => {
                const options = {
                    headers: {
                        'x-f5-auth-token': data.token
                    }
                };
                return utils.makeRequest(dutSecondary.ip, uri, options);
            })
            .then((data) => {
                secondarySelfIps = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('should check Azure route table route(s) next hop matches self IP (secondary)', function () {
        this.retries(25);
        let networkClient;

        return AzureCliCredentials.create()
            .then((creds) => {
                networkClient = new NetworkManagementClient(creds, creds.tokenInfo.subscription);
                return networkClient.routeTables.listAll();
            })
            .then((routeTables) => {
                let match = false;
                // filter
                const routeTagKey = Object.keys(declaration.failoverRoutes.scopingTags)[0];
                const routeTagValue = declaration.failoverRoutes.scopingTags[routeTagKey];
                routeTables = routeTables.filter(i => i.tags
                    && Object.keys(i.tags).indexOf(routeTagKey) !== -1
                    && i.tags[routeTagKey] === routeTagValue);
                // check
                routeTables.forEach((routeTable) => {
                    routeTable.routes.forEach((route) => {
                        if (secondarySelfIps.indexOf(route.nextHopIpAddress) !== -1) {
                            match = true;
                        }
                    });
                });
                // assert
                if (!match) {
                    assert.fail('Matching next hop not found');
                }
            })
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (secondary) to standby', () => {
        const uri = '/mgmt/tm/sys/failover';

        return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                options.method = 'POST';
                options.body = {
                    command: 'run',
                    standby: true
                };
                return utils.makeRequest(dutSecondary.ip, uri, options);
            })
            .catch(err => Promise.reject(err));
    });
});
