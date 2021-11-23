/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
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

const constants = require('../../../../constants.js');
const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const RETRIES = constants.RETRIES;

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter((dut) => dut.primary)[0];
const dutSecondary = duts.filter((dut) => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();
const rgName = deploymentInfo.deploymentId;

const declaration = funcUtils.getDeploymentDeclaration();
const networkInterfaceTagKey = Object.keys(declaration.failoverAddresses.scopingTags)[0];
const networkInterfaceTagValue = declaration.failoverAddresses.scopingTags[networkInterfaceTagKey];
const routeTagKey = Object.keys(declaration.failoverRoutes.routeGroupDefinitions[0].scopingTags)[0];
const routeTagValue = declaration.failoverRoutes.routeGroupDefinitions[0].scopingTags[routeTagKey];

// helper functions
function networkInterfaceMatch(networkInterfaces, selfIps, virtualAddresses) {
    let match = false;
    const myNics = [];
    // filter
    networkInterfaces = networkInterfaces.filter((i) => i.tags
        && Object.keys(i.tags).indexOf(networkInterfaceTagKey) !== -1
        && i.tags[networkInterfaceTagKey] === networkInterfaceTagValue);
    networkInterfaces.forEach((nic) => {
        nic.ipConfigurations.forEach((ipConfiguration) => {
            selfIps.forEach((address) => {
                if (ipConfiguration.privateIPAddress === address) {
                    myNics.push(nic);
                }
            });
        });
    });
    // check
    myNics.forEach((nic) => {
        nic.ipConfigurations.forEach((ipConfiguration) => {
            virtualAddresses.forEach((address) => {
                if (ipConfiguration.privateIPAddress === address) {
                    match = true;
                }
            });
        });
    });
    // assert
    if (!match) {
        assert.fail('Matching ipconfig not found');
    }
}

function _filterRouteTablesBasedOnTags(routeTables) {
    return routeTables.filter((i) => i.tags
        && Object.keys(i.tags).indexOf(routeTagKey) !== -1
        && i.tags[routeTagKey] === routeTagValue);
}

function routeMatch(routeTables, selfIps) {
    let match = false;
    // filter
    routeTables = _filterRouteTablesBasedOnTags(routeTables);
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
}
// end helper functions

describe('Provider: Azure', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];
    let virtualAddresses = [];

    let networkClient;

    before(function () {
        this.timeout(10000);

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
                .catch((err) => Promise.reject(err));
        } else {
            promise = AzureCliCredentials.create()
                .then((data) => {
                    const credentials = data;
                    return { credentials, subscriptionId: data.tokenInfo.subscription };
                })
                .catch((err) => Promise.reject(err));
        }

        return Promise.resolve(promise)
            .then((creds) => {
                networkClient = new NetworkManagementClient(creds.credentials, creds.subscriptionId);
                return utils.getAuthToken(dutPrimary.ip, dutPrimary.port, dutPrimary.username,
                    dutPrimary.password);
            })
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                options.port = dutPrimary.port;
                dutPrimary.authData = data;
                return utils.makeRequest(dutPrimary.ip, '/mgmt/tm/ltm/virtual-address', options);
            })
            .then((data) => {
                virtualAddresses = data.items.map((i) => i.address.split('/')[0]);
                return utils.getAuthToken(dutPrimary.ip, dutPrimary.port, dutPrimary.username,
                    dutPrimary.password);
            })
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                options.port = dutPrimary.port;
                return utils.makeRequest(dutPrimary.ip, '/mgmt/tm/net/self', options);
            })
            .then((data) => {
                primarySelfIps = data.items.map((i) => i.address.split('/')[0]);
                return utils.getAuthToken(dutSecondary.ip, dutSecondary.port, dutSecondary.username,
                    dutSecondary.password);
            })
            .then((data) => {
                dutSecondary.authData = data;
                const options = funcUtils.makeOptions({ authToken: data.token });
                options.port = dutSecondary.port;
                return utils.makeRequest(dutSecondary.ip, '/mgmt/tm/net/self', options);
            })
            .then((data) => {
                secondarySelfIps = data.items.map((i) => i.address.split('/')[0]);
            })
            .catch((err) => Promise.reject(err));
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    // local functions
    function checkNetworkInterfaces(selfIps, virtualAddressesArg) {
        return networkClient.networkInterfaces.list(rgName)
            .then((networkInterfaces) => {
                networkInterfaceMatch(networkInterfaces, selfIps, virtualAddressesArg);
            })
            .catch((err) => Promise.reject(err));
    }
    function checkRouteTables(selfIps) {
        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, selfIps);
            })
            .catch((err) => Promise.reject(err));
    }

    function getAssociatedRouteTables(selfIps) {
        const result = [];
        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                // filter
                routeTables = _filterRouteTablesBasedOnTags(routeTables);
                // check
                routeTables.forEach((routeTable) => {
                    routeTable.routes.forEach((route) => {
                        if (selfIps.indexOf(route.nextHopIpAddress) !== -1) {
                            result.push({
                                routeTableId: routeTable.id,
                                routeTableName: routeTable.name,
                                networkId: routeTable.subnets[0].id
                            });
                        }
                    });
                });
                return Promise.resolve(result);
            })
            .catch((err) => Promise.reject(err));
    }

    it('should ensure secondary is not primary', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
    ));

    it('should check network interfaces contains virtual address (primary)', function () {
        this.retries(RETRIES.LONG);
        return checkNetworkInterfaces(primarySelfIps, virtualAddresses)
            .catch((err) => Promise.reject(err));
    });

    it('should check Azure route table route(s) next hop matches self IP (primary)', function () {
        this.retries(RETRIES.MEDIUM);
        return checkRouteTables(primarySelfIps)
            .catch((err) => Promise.reject(err));
    });

    it('should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
    ));

    it('should check network interfaces contains virtual address (secondary)', function () {
        this.retries(RETRIES.LONG);

        return checkNetworkInterfaces(secondarySelfIps, virtualAddresses)
            .catch((err) => Promise.reject(err));
    });

    it('should check Azure route table route(s) next hop matches self IP (secondary)', function () {
        this.retries(RETRIES.MEDIUM);

        return checkRouteTables(secondarySelfIps)
            .catch((err) => Promise.reject(err));
    });

    it('should wait 30 seconds before force standby', () => new Promise(
        (resolve) => setTimeout(resolve, 30000)
    ));

    it('should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
    ));

    it('should check network interfaces contains virtual address (primary) ', function () {
        this.retries(RETRIES.LONG);

        return checkNetworkInterfaces(primarySelfIps, virtualAddresses)
            .catch((err) => Promise.reject(err));
    });

    it('should check Azure route table route(s) next hop matches self IP (primary) ', function () {
        this.retries(RETRIES.MEDIUM);

        return checkRouteTables(primarySelfIps)
            .catch((err) => Promise.reject(err));
    });

    // Flapping scenario: should check failover objects get assigned back to BIG-IP (primary)

    // ideally this would be replaced by a check for previous failover task success completion
    it('wait until taskState is success on primary BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            (resolve) => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutPrimary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutPrimary.authData.token,
                    hostname: dutPrimary.hostname,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch((err) => Promise.reject(err));
    });

    it('Flapping scenario: should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
    ));

    it('wait until taskState is running on standby BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            (resolve) => setTimeout(resolve, 1000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutSecondary.ip,
                {
                    taskState: constants.FAILOVER_STATES.RUN,
                    authToken: dutSecondary.authData.token,
                    hostname: dutSecondary.hostname,
                    port: dutSecondary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch((err) => Promise.reject(err));
    });

    it('Flapping scenario: should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
    ));

    it('wait until taskState is success on primary BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            (resolve) => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutPrimary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutPrimary.authData.token,
                    hostname: dutPrimary.hostname,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch((err) => Promise.reject(err));
    });

    it('Flapping scenario: should check network interfaces contains virtual address (primary) ', function () {
        this.retries(RETRIES.LONG);

        return checkNetworkInterfaces(primarySelfIps, virtualAddresses)
            .catch((err) => Promise.reject(err));
    });

    it('Flapping scenario: should check route table route(s) next hop matches self IP (primary) ', function () {
        this.retries(RETRIES.MEDIUM);

        return checkRouteTables(primarySelfIps)
            .catch((err) => Promise.reject(err));
    });

    it('Should retrieve addresses and routes for primary', function () {
        this.retries(RETRIES.LONG);
        let expectedRoutes;
        return getAssociatedRouteTables(primarySelfIps)
            .then((routes) => {
                expectedRoutes = routes;
            })
            .then(() => funcUtils.getInspectStatus(dutPrimary.ip,
                {
                    authToken: dutPrimary.authData.token,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert.ok(data.hostName === dutPrimary.hostname);
                assert.deepStrictEqual(data.routes, expectedRoutes);
                data.addresses.forEach((address) => {
                    if (address.publicIpAddress === '') {
                        assert.ok(primarySelfIps.includes(address.privateIpAddress));
                    }
                });
            })
            .catch((err) => Promise.reject(err));
    });

    it('Should retrieve addresses and not routes for secondary', function () {
        this.retries(RETRIES.LONG);
        return funcUtils.getInspectStatus(dutSecondary.ip,
            {
                authToken: dutSecondary.authData.token,
                port: dutSecondary.port
            })
            .then((data) => {
                assert.deepStrictEqual(data.hostName, dutSecondary.hostname);
                assert.deepStrictEqual(data.routes, []);
                data.addresses.forEach((address) => {
                    if (address.publicIpAddress === '') {
                        assert.ok(secondarySelfIps.includes(address.privateIpAddress));
                    }
                });
            })
            .catch((err) => Promise.reject(err));
    });

    it('Dry run: should retrieve failover objects that will change when standby  BIG-IP (secondary) becomes active', () => funcUtils.invokeFailoverDryRun(dutSecondary.ip,
        {
            authToken: dutSecondary.authData.token,
            port: dutSecondary.port
        })
        .then((data) => {
            const addressesInterfaceId = data.addresses.interfaces.associate[0][0];
            const routeTableId = data.routes.operations[0][0];
            assert.deepStrictEqual(addressesInterfaceId, rgName);
            assert.deepStrictEqual(routeTableId, rgName);
        })
        .catch((err) => Promise.reject(err)));
});
