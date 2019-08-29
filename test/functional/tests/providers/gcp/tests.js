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
const fs = require('fs');

const compute = google.compute('v1');


const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();
const declaration = funcUtils.getDeploymentDeclaration();

let request = {};

// Helper functions
function configureAuth() {
    if (process.env.GOOGLE_CREDENTIALS) {
        const tmpCredsFile = `${process.env.CI_PROJECT_DIR}/gcloud_creds.json`;
        fs.writeFileSync(tmpCredsFile, process.env.GOOGLE_CREDENTIALS);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpCredsFile;
        return google.auth.getClient({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
    }
    return Promise.reject(new Error('gcloud creds are not provided via env variable titled as GOOGLE_CREDENTIALS'));
}

describe('Provider: GCP', () => {
    let primarySelfIps = [];
    let secondarySelfIps = [];
    let virtualAddresses = [];
    let vms = [];

    before(() => configureAuth()
        .then((authClient) => {
            request = {
                project: JSON.parse(process.env.GOOGLE_CREDENTIALS).project_id,
                auth: authClient,
                zone: 'us-west1-a',
                region: 'us-west1'
            };
            return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password);
        })
        .then((data) => {
            const uri = '/mgmt/tm/net/self';
            dutPrimary.authData = data;
            const options = funcUtils.makeOptions({ authToken: dutPrimary.authData.token });
            return utils.makeRequest(dutPrimary.ip, uri, options);
        })
        .then((data) => {
            primarySelfIps = data.items.map(i => i.address.split('/')[0]);
            return utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password);
        })
        .then(() => {
            const uri = '/mgmt/tm/ltm/virtual-address';
            const options = funcUtils.makeOptions({ authToken: dutPrimary.authData.token });
            return utils.makeRequest(dutPrimary.ip, uri, options);
        })
        .then((data) => {
            virtualAddresses = data.items.map(i => i.address.split('/')[0]);
        })
        .then(() => utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password))
        .then((data) => {
            dutSecondary.authData = data;
            const uri = '/mgmt/tm/net/self';
            const options = funcUtils.makeOptions({ authToken: dutSecondary.authData.token });
            return utils.makeRequest(dutSecondary.ip, uri, options);
        })
        .then((data) => {
            secondarySelfIps = data.items.map(i => i.address.split('/')[0]);
        })
        .catch(err => Promise.reject(err)));

    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
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
                            vms.push(vm);
                        }
                    }
                });
            }
            const networkIp = [];
            vms.forEach((vm) => {
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

    it('validate initial forwardng rule and route should reference primary', () => {
        compute.routes.list(request, (err, response) => {
            let testRouteFlag = false;
            if (response.data.items) {
                response.data.items.forEach((route) => {
                    if (route.name.indexOf(deploymentInfo.deploymentId) !== -1) {
                        testRouteFlag = primarySelfIps.indexOf(route.nextHopIp) !== -1;
                    }
                });
                assert.ok(testRouteFlag);
            }
        });
        compute.forwardingRules.list(request, (err, response) => {
            let testFwdRuleFlag = false;
            if (response.data.items) {
                response.data.items.forEach((fwdRule) => {
                    if (fwdRule.name.indexOf(deploymentInfo.deploymentId) !== -1) {
                        testFwdRuleFlag = fwdRule.target.indexOf(`${dutPrimary.hostname.split('-')[3]}-${dutPrimary.hostname.split('-')[4]}`) !== -1;
                    }
                });
                assert.ok(testFwdRuleFlag);
            }
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
        vms = [];
        compute.instances.list(request, (err, response) => {
            if (response.data.items) {
                response.data.items.forEach((vm) => {
                    if (vm.labels) {
                        if (Object.values(vm.labels)
                            .indexOf(declaration.externalStorage.scopingTags.f5_cloud_failover_label) !== -1
                            && Object.keys(vm.labels)
                                .indexOf(Object.keys(declaration.externalStorage.scopingTags)[0]) !== -1) {
                            if (vm.name.indexOf(dutSecondary.hostname) !== -1) {
                                assert.ok(virtualAddresses.indexOf(vm.networkInterfaces[0].aliasIpRanges[0].ipCidrRange.split('/')[0]) !== -1);
                            }
                        }
                    }
                });
            }
        });
    });

    it('validate failover event - forwardng rule and route should reference secondary', () => {
        compute.routes.list(request, (err, response) => {
            let testRouteFlag = false;
            if (response.data.items) {
                response.data.items.forEach((route) => {
                    if (route.name.indexOf(deploymentInfo.deploymentId) !== -1) {
                        testRouteFlag = secondarySelfIps.indexOf(route.nextHopIp) !== -1;
                    }
                });
                assert.ok(testRouteFlag);
            }
        });
        compute.forwardingRules.list(request, (err, response) => {
            let testFwdRuleFlag = false;
            if (response.data.items) {
                response.data.items.forEach((fwdRule) => {
                    if (fwdRule.name.indexOf(deploymentInfo.deploymentId) !== -1) {
                        testFwdRuleFlag = fwdRule.target.indexOf(`${dutSecondary.hostname.split('-')[3]}-${dutSecondary.hostname.split('-')[4]}`) !== -1;
                    }
                });
                assert.ok(testFwdRuleFlag);
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

    it('validate failover event - primary should be active now', () => {
        vms = [];
        compute.instances.list(request, (err, response) => {
            if (response.data.items) {
                response.data.items.forEach((vm) => {
                    if (vm.labels) {
                        if (Object.values(vm.labels)
                            .indexOf(declaration.externalStorage.scopingTags.f5_cloud_failover_label) !== -1
                            && Object.keys(vm.labels)
                                .indexOf(Object.keys(declaration.externalStorage.scopingTags)[0]) !== -1) {
                            if (vm.name.indexOf(dutPrimary.hostname) !== -1) {
                                assert.ok(virtualAddresses.indexOf(vm.networkInterfaces[0].aliasIpRanges[0].ipCidrRange.split('/')[0]) !== -1);
                            }
                        }
                    }
                });
            }
        });
    });


    it('validate failover event - forwardng rule and route should reference primary', () => {
        compute.routes.list(request, (err, response) => {
            let testRouteFlag = false;
            if (response.data.items) {
                response.data.items.forEach((route) => {
                    if (route.name.indexOf(deploymentInfo.deploymentId) !== -1) {
                        testRouteFlag = primarySelfIps.indexOf(route.nextHopIp) !== -1;
                    }
                });
                assert.ok(testRouteFlag);
            }
        });
        compute.forwardingRules.list(request, (err, response) => {
            let testFwdRuleFlag = false;
            if (response.data.items) {
                response.data.items.forEach((fwdRule) => {
                    if (fwdRule.name.indexOf(deploymentInfo.deploymentId) !== -1) {
                        testFwdRuleFlag = fwdRule.target.indexOf(`${dutPrimary.hostname.split('-')[3]}-${dutPrimary.hostname.split('-')[4]}`) !== -1;
                    }
                });
                assert.ok(testFwdRuleFlag);
            }
        });
    });
});
