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
const exampleDeclarationIPv6 = require('../../shared/exampleDeclarationIPv6.json');

const deploymentDeclaration = funcUtils.getDeploymentDeclaration(exampleDeclarationIPv6);

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
        const cidrBlock = route.DestinationCidrBlock || route.DestinationIpv6CidrBlock;
        const scopingAddresses = deploymentDeclaration.failoverRoutes.scopingAddressRanges.map(i => i.range);
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

describe(`Provider: AWS ${deploymentInfo.networkTopology}`, () => {
    let ec2;

    before(function () {
        this.timeout(10000);

        AWS.config.update({ region: deploymentInfo.region });
        ec2 = new AWS.EC2();


        return Promise.all([
            utils.getAuthToken(dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password),
            utils.getAuthToken(dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password)
        ])
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

    function getElasticIps(instanceId) {
        const paramInstanceId = instanceId || null;
        const params = {
            Filters: [
                {
                    Name: 'tag:f5_cloud_failover_label',
                    Values: [deploymentInfo.deploymentId]
                }
            ]
        };
        if (paramInstanceId) {
            params.Filters.push(
                {
                    Name: 'instance-id',
                    Values: [
                        paramInstanceId
                    ]
                }
            );
        }

        return new Promise((resolve, reject) => {
            ec2.describeAddresses(params).promise()
                .then(data => resolve(data))
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

    function getRouteTableRoutes(instanceId) {
        const instanceIdParam = instanceId || null;
        const params = {
            Filters: [
                {
                    Name: 'tag:f5_cloud_failover_label',
                    Values: [deploymentInfo.deploymentId]
                }
            ]
        };
        if (instanceIdParam) {
            params.Filters.push(
                {
                    Name: 'route.instance-id',
                    Values: [
                        instanceIdParam
                    ]
                }
            );
        }

        return new Promise((resolve, reject) => {
            ec2.describeRouteTables(params).promise()
                .then((routeTables) => {
                    resolve(routeTables.RouteTables);
                })
                .catch(err => reject(err));
        });
    }

    function checkElasticIP(instance) {
        return Promise.all([
            getElasticIpPrivateAddress(),
            getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
        ])
            .then((results) => {
                const privateIp = results[0];
                const instanceData = results[1];
                const privateIpToInstance = {};

                Object.keys(instanceData).forEach((key) => {
                    privateIpToInstance[instanceData[key].PublicIpAddress] = {
                        InstanceId: key,
                        NetworkInterfaces: instanceData[key].NetworkInterfaces
                    };
                });
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
                matchRouteTables(responses[0][0].Routes, responses[1]);
            })
            .catch(err => Promise.reject(err));
    }

    // Functional tests

    it('should post IPv6 declaration', () => {
        const uri = constants.DECLARE_ENDPOINT;
        const options = {
            method: 'POST',
            body: deploymentDeclaration,
            headers: {
                'x-f5-auth-token': dutPrimary.authData.token
            }
        };
        return utils.makeRequest(dutPrimary.ip, uri, options)
            .then((data) => {
                data = data || {};
                assert.strictEqual(data.message, 'success');
            })
            .catch(err => Promise.reject(err));
    });

    it('should ensure secondary is not primary', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
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

    it('should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
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

    it('wait until taskState is success on secondary BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);

        return new Promise(
            resolve => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutSecondary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutSecondary.authData.token,
                    hostname: dutSecondary.hostname,
                    port: dutSecondary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
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
                    hostname: dutPrimary.hostname,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
    ));

    it('wait until taskState is running (or succeeded) on standby BIG-IP', function () {
        this.retries(RETRIES.MEDIUM);
        return new Promise(
            resolve => setTimeout(resolve, 1000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutSecondary.ip,
                {
                    taskStates: [constants.FAILOVER_STATES.RUN, constants.FAILOVER_STATES.PASS],
                    authToken: dutSecondary.authData.token,
                    hostname: dutSecondary.hostname
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
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
            .then((data) => {
                assert(data.boolean, data);
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
            addresses: [],
            routes: [],
            instance: dutPrimary.instanceId,
            hostName: dutPrimary.hostname
        };

        return Promise.all([
            getElasticIps(dutPrimary.instanceId),
            getRouteTableRoutes(dutPrimary.instanceId)
        ])
            .then((results) => {
                results[0].Addresses.forEach((address) => {
                    expectedResult.addresses.push({
                        publicIpAddress: address.PublicIp,
                        privateIpAddress: address.PrivateIpAddress,
                        networkInterfaceId: address.NetworkInterfaceId
                    });
                });
                results[1].forEach((route) => {
                    expectedResult.routes.push({
                        routeTableId: route.RouteTableId,
                        routeTableName: null,
                        networkId: route.VpcId
                    });
                });
            })
            .then(() => funcUtils.getInspectStatus(dutPrimary.ip,
                {
                    authToken: dutPrimary.authData.token,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert.deepStrictEqual(data.instance, expectedResult.instance);
                assert.deepStrictEqual(data.hostName, expectedResult.hostName);
                assert.deepStrictEqual(data.routes, expectedResult.routes);
            })
            .catch(err => Promise.reject(err));
    });

    it('Should retrieve addresses and not routes for secondary (vm1)', function () {
        this.retries(RETRIES.LONG);

        const expectedResult = {
            addresses: [{
                privateIp: dutSecondary.ip
            }],
            instance: dutSecondary.instanceId,
            hostName: dutSecondary.hostname
        };

        return Promise.all([
            getElasticIps(dutSecondary.instanceId),
            getRouteTableRoutes(dutSecondary.instanceId)
        ])
            .then((results) => {
                results[0].Addresses.forEach((address) => {
                    expectedResult.addresses.push({
                        publicIpAddress: address.PublicIp,
                        privateIpAddress: address.PrivateIpAddress,
                        associationId: address.AssociationId,
                        networkInterfaceId: address.NetworkInterfaceId
                    });
                });
                assert(results[1].length === 0, 'Expect no routes to be associated with standby device');
            })
            .then(() => funcUtils.getInspectStatus(dutSecondary.ip,
                {
                    authToken: dutSecondary.authData.token,
                    port: dutSecondary.port
                }))
            .then((data) => {
                assert.deepStrictEqual(data.instance, expectedResult.instance);
                assert.deepStrictEqual(data.routes, []);
            })
            .catch(err => Promise.reject(err));
    });
});
