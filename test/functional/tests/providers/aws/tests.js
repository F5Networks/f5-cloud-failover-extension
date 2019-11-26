/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const AWS = require('aws-sdk');

const constants = require('../../../../constants.js');
const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const RETRIES = constants.RETRIES;

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();
const deploymentDeclaration = funcUtils.getDeploymentDeclaration();

// Helper functions
function matchElasticIpToInstance(privateIp, instances, instance) {
    let match = false;
    const primary = instances[instance.ip];

    primary.NetworkInterfaces.forEach((nic) => {
        nic.PrivateIpAddresses.forEach((pip) => {
            if (pip.PrivateIpAddress === privateIp) {
                match = true;
            }
        });
    });

    // assert
    if (!match) {
        assert.fail('ElasticIP does not match primary\'s secondary private IP');
    }
}

function matchRouteTables(routes, nics) {
    let match = false;
    let nicToCheck;

    routes.forEach((route) => {
        const cidrBlock = route.DestinationCidrBlock;
        const scopingAddresses = deploymentDeclaration.failoverRoutes.scopingAddressRanges;
        const selfIpToUse = scopingAddresses.filter(item => cidrBlock.indexOf(item) !== -1);
        if (selfIpToUse.length > 0) {
            nicToCheck = route.NetworkInterfaceId;
        }
    });
    if (nics.indexOf(nicToCheck) !== -1) {
        match = true;
    }

    // assert
    if (!match) {
        assert.fail('ElasticIP does not match primary\'s secondary private IP');
    }
}

describe('Provider: AWS', () => {
    const privateIpToInstance = {};

    let ec2;

    before(function () {
        this.timeout(10000);

        AWS.config.update({ region: deploymentInfo.region });
        ec2 = new AWS.EC2();


        return getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
            .then((data) => {
                Object.keys(data).forEach((key) => {
                    privateIpToInstance[data[key].PublicIpAddress] = {
                        InstanceId: key,
                        NetworkInterfaces: data[key].NetworkInterfaces
                    };
                });
            })
            .then(() => Promise.all([
                utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password),
                utils.getAuthToken(dutSecondary.ip, dutSecondary.username, dutSecondary.password)
            ]))
            .then((results) => {
                dutPrimary.authData = results[0];
                dutSecondary.authData = results[1];
            })
            .catch(err => Promise.reject(err));
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    // local functions
    function getEc2Instances(tags) {
        const params = {
            Filters: [
                {
                    Name: `tag:${tags.Key}`,
                    Values: [tags.Value]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            const instances = {};
            ec2.describeInstances(params).promise()
                .then((data) => {
                    data.Reservations.forEach((reservation) => {
                        const instance = reservation.Instances[0];
                        instances[instance.InstanceId] = instance;
                    });
                    resolve(instances);
                })
                .catch(err => reject(err));
        });
    }

    // function get
    function getElasticIpPrivateAddress() {
        const params = {
            Filters: [
                {
                    Name: 'tag:f5_cloud_failover_label',
                    Values: [deploymentInfo.deploymentId]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            ec2.describeAddresses(params).promise()
                .then((data) => {
                    const privateIp = data.Addresses[0].PrivateIpAddress;
                    resolve(privateIp);
                })
                .catch(err => reject(err));
        });
    }

    function getInstanceNics(instanceId) {
        const params = {
            Filters: [
                {
                    Name: 'attachment.instance-id',
                    Values: [instanceId]
                }
            ]
        };
        return new Promise((resolve, reject) => {
            ec2.describeNetworkInterfaces(params).promise()
                .then((data) => {
                    const nics = data.NetworkInterfaces.map(nic => nic.NetworkInterfaceId);
                    resolve(nics);
                })
                .catch(err => reject(err));
        });
    }

    function getRouteTableRoutes() {
        const params = {
            Filters: [
                {
                    Name: 'tag:f5_cloud_failover_label',
                    Values: [deploymentInfo.deploymentId]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            ec2.describeRouteTables(params).promise()
                .then((data) => {
                    const routes = data.RouteTables[0].Routes;
                    resolve(routes);
                })
                .catch(err => reject(err));
        });
    }

    function checkElasticIP(instance) {
        return getElasticIpPrivateAddress()
            .then((privateIp) => {
                matchElasticIpToInstance(privateIp, privateIpToInstance, instance);
            })
            .catch(err => Promise.reject(err));
    }

    function checkRouteTable(instance) {
        // Need to get the Primary instance NIC ID from AWS
        return Promise.all([
            getRouteTableRoutes(),
            getInstanceNics(instance.instanceId)
        ])
            .then((responses) => {
                matchRouteTables(responses[0], responses[1]);
            })
            .catch(err => Promise.reject(err));
    }

    // Functional tests

    it('should ensure secondary is not primary', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.username, dutSecondary.password
    ));

    // Test IP and Route failover
    it('should check that Elastic IP is mapped to primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('should check AWS route table routes for next hop matches primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTable(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('should wait 30 seconds before force standby', () => new Promise(
        resolve => setTimeout(resolve, 30000)
    ));

    it('should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.username, dutPrimary.password
    ));

    it('should check that Elastic IP is mapped to secondary (vm1)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutSecondary)
            .catch(err => Promise.reject(err));
    });

    it('should check AWS route table routes for next hop matches secondary (vm1)', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTable(dutSecondary)
            .catch(err => Promise.reject(err));
    });

    it('should wait 30 seconds before force standby', () => new Promise(
        resolve => setTimeout(resolve, 30000)
    ));

    it('should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.username, dutSecondary.password
    ));

    it('should check that Elastic IP is mapped to primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('should check AWS route table routes for next hop matches primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTable(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    // Flapping scenario: should check failover objects get assigned back to BIG-IP (primary)

    it('wait until taskState is success on primary BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            resolve => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutPrimary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutPrimary.authData.token,
                    hostname: dutPrimary.hostname
                }))
            .then((bool) => {
                assert(bool);
            })
            .catch(err => Promise.reject(err));
    });


    it('Flapping scenario: should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.username, dutPrimary.password
    ));

    it('wait until taskState is running on standby BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            resolve => setTimeout(resolve, 1000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutSecondary.ip,
                {
                    taskState: constants.FAILOVER_STATES.RUN,
                    authToken: dutSecondary.authData.token,
                    hostname: dutSecondary.hostname
                }))
            .then((bool) => {
                assert(bool);
            })
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.username, dutSecondary.password
    ));

    it('wait until taskState is success on primary BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            resolve => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutPrimary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutPrimary.authData.token,
                    hostname: dutPrimary.hostname
                }))
            .then((bool) => {
                assert(bool);
            })
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should check that Elastic IP is mapped to primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should check AWS route table routes for next hop matches primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTable(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('Should retrieve addresses and routes for primary (vm0)', function () {
        this.retries(RETRIES.LONG);
        const expectedResult = {
            address: [{
                privateIp: dutPrimary.ip
            }],
            instance: dutPrimary.instanceId,
            hostName: dutPrimary.hostname
        };
        return funcUtils.getInspectStatus(dutPrimary.ip,
            {
                authToken: dutPrimary.authData.token
            })
            .then((data) => {
                assert.notStrictEqual(expectedResult, data);
            })
            .catch(err => Promise.reject(err));
    });

    it('Should retrieve addresses and not routes for secondary (vm1)', function () {
        this.retries(RETRIES.LONG);
        const expectedResult = {
            address: [{
                privateIp: dutSecondary.ip
            }],
            instance: dutSecondary.instanceId,
            hostName: dutSecondary.hostname
        };
        return funcUtils.getInspectStatus(dutSecondary.ip,
            {
                authToken: dutSecondary.authData.token
            })
            .then((data) => {
                assert.notStrictEqual(expectedResult, data);
                assert.strictEqual(data.routes.length, 0);
            })
            .catch(err => Promise.reject(err));
    });
});
