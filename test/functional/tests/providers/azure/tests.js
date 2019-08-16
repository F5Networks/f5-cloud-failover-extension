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
const AzureSPCredentials = require('@azure/ms-rest-nodeauth').loginWithServicePrincipalSecretWithAuthResponse;
const NetworkManagementClient = require('@azure/arm-network').NetworkManagementClient;

const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const declaration = funcUtils.getDeploymentDeclaration();

const routeTagKey = Object.keys(declaration.failoverRoutes.scopingTags)[0];
const routeTagValue = declaration.failoverRoutes.scopingTags[routeTagKey];
// helper functions
const routeTableFilter = i => i.tags
    && Object.keys(i.tags).indexOf(routeTagKey) !== -1
    && i.tags[routeTagKey] === routeTagValue;
const routeMatch = (routeTables, selfIps) => {
    let match = false;
    // filter
    routeTables = routeTables.filter(routeTableFilter);
    // check
    routeTables.forEach((routeTable) => {
        routeTable.routes.forEach((route) => {
            if (selfIps.indexOf(route.nextHopIpAddress) !== -1) {
                match = true;
            }
        });
    });
    // assert
    if (!match) {
        assert.fail('Matching next hop not found');
    }
};

describe('Provider: Azure', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];

    let networkClient;

    before(() => {
        // support both Azure CLI and Service Principal Authentication schemes
        let promise;
        const clientId = process.env.ARM_CLIENT_ID;
        const clientSecret = process.env.ARM_CLIENT_SECRET;
        const tenantId = process.env.ARM_TENANT_ID;
        const subscriptionId = process.env.ARM_SUBSCRIPTION_ID;

        if (clientId && clientSecret && subscriptionId && tenantId) {
            promise = AzureSPCredentials(clientId, clientSecret, tenantId)
                .then((data) => {
                    const credentials = data.credentials;
                    return { credentials, subscriptionId };
                })
                .catch(err => Promise.reject(err));
        } else {
            promise = AzureCliCredentials.create()
                .then((data) => {
                    const credentials = data;
                    return { credentials, subscriptionId: data.tokenInfo.subscription };
                })
                .catch(err => Promise.reject(err));
        }

        return Promise.resolve(promise)
            .then((creds) => {
                networkClient = new NetworkManagementClient(creds.credentials, creds.subscriptionId);
            })
            .catch(err => Promise.reject(err));
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

    it('should check Azure route table route(s) next hop matches self IP (primary)', function () {
        this.retries(25);

        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, primarySelfIps);
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

        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, secondarySelfIps);
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
