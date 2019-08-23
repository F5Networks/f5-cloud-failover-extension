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
const { google } = require('googleapis');

const compute = google.compute('v1');


const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

// const deploymentInfo = funcUtils.getEnvironmentInfo();

const declaration = funcUtils.getDeploymentDeclaration();
// const networkInterfaceTagValue = declaration.failoverAddresses.scopingTags[networkInterfaceTagKey];
// const routeTagKey = Object.keys(declaration.failoverRoutes.scopingTags)[0];
// const routeTagValue = declaration.failoverRoutes.scopingTags[routeTagKey];

// Helper functions

const configureAuth = () => {
    if (process.env.GOOGLE_CREDENTIALS) {
        return google.auth.getClient({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
    }
    return Promise.reject(new Error('gcloud creds are not provided via env variable titled as GOOGLE_CREDENTIALS'));
};

let request = {};

describe('Provider: GCP', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];
    let primaryVirtualAddresses = [];
    let secondaryVirtualAddresses = [];
    let gcloudVms = [];

    before(() => configureAuth()
        .then((authClient) => {
            request = {
                project: JSON.parse(process.env.GOOGLE_CREDENTIALS).project_id,
                auth: authClient,
                zone: 'us-west1-a'
            };
        }).catch(err => Promise.reject(err)));
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

    it('should get BIG-IP (primary) virtual address(es)', () => {
        const uri = '/mgmt/tm/ltm/virtual-address';

        return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutPrimary.ip, uri, options);
            })
            .then((data) => {
                primaryVirtualAddresses = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('should get BIG-IP (secondary) self IP(s)', () => {
        const uri = '/mgmt/tm/net/self';

        return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutSecondary.ip, uri, options);
            })
            .then((data) => {
                secondarySelfIps = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('should get BIG-IP (secondary) virtual address(es)', () => {
        const uri = '/mgmt/tm/ltm/virtual-address';

        return utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
            .then((data) => {
                const options = funcUtils.makeOptions({ authToken: data.token });
                return utils.makeRequest(dutSecondary.ip, uri, options);
            })
            .then((data) => {
                secondaryVirtualAddresses = data.items.map(i => i.address.split('/')[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate Google Primary VM IP Addresess', () => {
        compute.instances.list(request, (err, response) => {
            if (response.data.items) {
                response.data.items.forEach((vm) => {
                    if (vm.labels) {
                        if (Object.values(vm.labels)
                            .indexOf(declaration.externalStorage.scopingTags.f5_cloud_failover_label) !== -1
                        && Object.keys(vm.labels)
                            .indexOf(Object.keys(declaration.externalStorage.scopingTags)[0]) !== -1) {
                            gcloudVms.push(vm);
                        }
                    }
                });
            }
            const networkIp = [];
            gcloudVms.forEach((vm) => {
                vm.networkInterfaces.forEach((nic) => {
                    networkIp.push(nic.networkIP);
                });
            });
            primarySelfIps.forEach((ipAddress) => {
                if (networkIp.indexOf(ipAddress) !== -1) {
                    assert.ok(true);
                } else {
                    assert.ok(false);
                }
            });
            secondarySelfIps.forEach((ipAddress) => {
                if (networkIp.indexOf(ipAddress) !== -1) {
                    assert.ok(true);
                } else {
                    assert.ok(false);
                }
            });
        });
    });

    it('validate virtualIp synced between BIGIP hosts', () => {
        primaryVirtualAddresses.forEach((item) => {
            assert.ok(secondaryVirtualAddresses.indexOf(item) !== -1);
        });
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
                return utils.makeRequest(dutPrimary.ip, uri, options)
                    .then(() => new Promise(resolve => setTimeout(resolve, 60000)));
            })
            .catch(err => Promise.reject(err));
    });

    it('validate failover event - secondary should be active now', () => {
        gcloudVms = [];
        compute.instances.list(request, (err, response) => {
            if (response.data.items) {
                response.data.items.forEach((vm) => {
                    if (vm.labels) {
                        if (Object.values(vm.labels)
                            .indexOf(declaration.externalStorage.scopingTags.f5_cloud_failover_label) !== -1
                            && Object.keys(vm.labels)
                                .indexOf(Object.keys(declaration.externalStorage.scopingTags)[0]) !== -1) {
                            if (vm.name.indexOf(dutSecondary.hostname) !== -1) {
                                assert.ok(primaryVirtualAddresses.indexOf(vm.networkInterfaces[0].aliasIpRanges[0].ipCidrRange.split('/')[0]) !== -1);
                            }
                        }
                    }
                });
            }
        });
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
                return utils.makeRequest(dutSecondary.ip, uri, options)
                    .then(() => new Promise(resolve => setTimeout(resolve, 60000)));
            })
            .catch(err => Promise.reject(err));
    });

    it('validate failover event - secondary should be active now', () => {
        gcloudVms = [];
        compute.instances.list(request, (err, response) => {
            if (response.data.items) {
                response.data.items.forEach((vm) => {
                    if (vm.labels) {
                        if (Object.values(vm.labels)
                            .indexOf(declaration.externalStorage.scopingTags.f5_cloud_failover_label) !== -1
                            && Object.keys(vm.labels)
                                .indexOf(Object.keys(declaration.externalStorage.scopingTags)[0]) !== -1) {
                            if (vm.name.indexOf(dutPrimary.hostname) !== -1) {
                                assert.ok(primaryVirtualAddresses.indexOf(vm.networkInterfaces[0].aliasIpRanges[0].ipCidrRange.split('/')[0]) !== -1);
                            }
                        }
                    }
                });
            }
        });
    });
});
