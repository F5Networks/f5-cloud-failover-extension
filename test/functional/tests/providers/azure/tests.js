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

const deploymentInfo = funcUtils.getEnvironmentInfo();
const rgName = deploymentInfo.deploymentId;

const declaration = funcUtils.getDeploymentDeclaration();
const networkInterfaceTagKey = Object.keys(declaration.failoverAddresses.scopingTags)[0];
const networkInterfaceTagValue = declaration.failoverAddresses.scopingTags[networkInterfaceTagKey];
const routeTagKey = Object.keys(declaration.failoverRoutes.scopingTags)[0];
const routeTagValue = declaration.failoverRoutes.scopingTags[routeTagKey];

// helper functions
const networkInterfaceFilter = i => i.tags
    && Object.keys(i.tags).indexOf(networkInterfaceTagKey) !== -1
    && i.tags[networkInterfaceTagKey] === networkInterfaceTagValue;
const routeTableFilter = i => i.tags
    && Object.keys(i.tags).indexOf(routeTagKey) !== -1
    && i.tags[routeTagKey] === routeTagValue;
const networkInterfaceMatch = (networkInterfaces, selfIps, virtualAddresses) => {
    console.log(selfIps, virtualAddresses)
    let match = false;
    const myNics = [];
    // filter
    networkInterfaces = networkInterfaces.filter(networkInterfaceFilter);
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
};
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
// end helper functions

describe('Provider: Azure', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];
    let primaryVirtualAddresses = [];
    let secondaryVirtualAddresses = [];

    let networkClient;

    before(function () {
        this.timeout(10000)
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
                return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password);
            })
            .then((data) => {
                const uri = '/mgmt/tm/ltm/virtual-address';
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutPrimary.ip, uri, options);
            })
            .then((data) => {
                primaryVirtualAddresses = data.items.map(i => i.address.split('/')[0]);
                return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password);
            })
            .then((data) => {
                const uri = '/mgmt/tm/net/self';
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutPrimary.ip, uri, options);
            })
            .then((data) => {
                primarySelfIps = data.items.map(i => i.address.split('/')[0]);
                return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password);
            })
            .then((data) => {
                const uri = '/mgmt/tm/ltm/virtual-address';
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutSecondary.ip, uri, options);
            })
            .then((data) => {
                secondaryVirtualAddresses = data.items.map(i => i.address.split('/')[0]);
                return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password);
            })
            .then((data) => {
                const uri = '/mgmt/tm/net/self';
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutSecondary.ip, uri, options);
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
    function checkPrimaryNetworkInterface() {
        return networkClient.networkInterfaces.list(rgName)
            .then((networkInterfaces) => {
                networkInterfaceMatch(networkInterfaces, primarySelfIps, primaryVirtualAddresses);
            })
            .catch(err => Promise.reject(err));
    }
    function checkSecondaryNetworkInterface() {
        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, secondarySelfIps);
            })
            .catch(err => Promise.reject(err));
    }
    function forcePrimaryBigIPStandby() {
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
    }
    function forceSecondaryBigIPStandby() {
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
    }

    // it('should get BIG-IP (primary) self IP(s)', () => {
    //     const uri = '/mgmt/tm/net/self';
    //
    //     return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
    //         .then((data) => {
    //             const options = funcUtils.makeOptions({ authToken: data.token });
    //             return utils.makeRequest(dutPrimary.ip, uri, options);
    //         })
    //         .then((data) => {
    //             primarySelfIps = data.items.map(i => i.address.split('/')[0]);
    //         })
    //         .catch(err => Promise.reject(err));
    // });

    // it('should get BIG-IP (primary) virtual address(es)', () => {
    //     const uri = '/mgmt/tm/ltm/virtual-address';
    //
    //     return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
    //         .then((data) => {
    //             const options = funcUtils.makeOptions({ authToken: data.token });
    //             return utils.makeRequest(dutPrimary.ip, uri, options);
    //         })
    //         .then((data) => {
    //             primaryVirtualAddresses = data.items.map(i => i.address.split('/')[0]);
    //         })
    //         .catch(err => Promise.reject(err));
    // });

    it('should check Azure network interfaces ipconfig matches virtual address (primary)', function () {
        this.retries(500);

        return networkClient.networkInterfaces.list(rgName)
            .then((networkInterfaces) => {
                networkInterfaceMatch(networkInterfaces, primarySelfIps, primaryVirtualAddresses);
            })
            .catch(err => Promise.reject(err));
    });

    it('should check Azure route table route(s) next hop matches self IP (primary)', function () {
        this.retries(100);

        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, primarySelfIps);
            })
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (primary) to standby', () => {
        return forcePrimaryBigIPStandby();
    });

    // it('should get BIG-IP (secondary) self IP(s)', () => {
    //     const uri = '/mgmt/tm/net/self';
    //
    //     return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
    //         .then((data) => {
    //             const options = funcUtils.makeOptions({ authToken: data.token });
    //             return utils.makeRequest(dutSecondary.ip, uri, options);
    //         })
    //         .then((data) => {
    //             secondarySelfIps = data.items.map(i => i.address.split('/')[0]);
    //         })
    //         .catch(err => Promise.reject(err));
    // });
    //
    // it('should get BIG-IP (secondary) virtual address(es)', () => {
    //     const uri = '/mgmt/tm/ltm/virtual-address';
    //
    //     return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
    //         .then((data) => {
    //             const options = funcUtils.makeOptions({ authToken: data.token });
    //             return utils.makeRequest(dutSecondary.ip, uri, options);
    //         })
    //         .then((data) => {
    //             secondaryVirtualAddresses = data.items.map(i => i.address.split('/')[0]);
    //         })
    //         .catch(err => Promise.reject(err));
    // });

    it('should check Azure network interfaces ipconfig matches virtual address (secondary)', function () {
        this.retries(500);
        return checkSecondaryNetworkInterface();
    });

    it('should check Azure route table route(s) next hop matches self IP (secondary)', function () {
        this.retries(100);

        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, secondarySelfIps);
            })
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (secondary) to standby', () => {
        forceSecondaryBigIPStandby();
    });

    it('should check Azure network interfaces ipconfig matches virtual address (primary) ', function () {
        this.retries(500);
        checkPrimaryNetworkInterface();
    });

    it('should check Azure route table route(s) next hop matches self IP (primary) ', function () {
        this.retries(100);

        return networkClient.routeTables.listAll()
            .then((routeTables) => {
                routeMatch(routeTables, primarySelfIps);
            })
            .catch(err => Promise.reject(err));
    });

    it('should check if the addresses will get assign back to BIG-IP (primary) in a flapping scenario', () => {
        // set BIG-IP (primary) to standby and make BIG-IP (secondary) to active
        forcePrimaryBigIPStandby();

        // check if the network interfaces matches with the virtual address of the BIG-IP (primary).
        // The secondary external IP should have swap from the primary to secondary BIG-IP.
        // TODO: need to execute them in a loop and make sure that secondary BIG-IP has the addresses swap from primary
        // TODO: consider using chai library to catch expect exception from primary 'Matching ipconfig not found'
        checkPrimaryNetworkInterface();
        checkSecondaryNetworkInterface();

        // set BIG-IP (secondary) to standby and make BIG-IP (primary) active
        forceSecondaryBigIPStandby();

        // Check the network interfaces and ensure that matches with the virtual address of the BIG-IP.
        // The secondary external IP should have swap from the secondary to primary BIG-IP.
        // TODO: need to execute them in a loop and make sure that primary BIG-IP has the addresses swap from secondary.
        checkPrimaryNetworkInterface();
        checkSecondaryNetworkInterface();
    });
});
