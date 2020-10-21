/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
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
function matchElasticIpsToInstance(eips, instance) {
    const privateAddresses = Array.prototype.concat.apply(
        [], instance.NetworkInterfaces.map(nic => nic.PrivateIpAddresses.map(ip => ip.PrivateIpAddress))
    );

    eips.forEach((eip) => {
        assert.strictEqual(
            privateAddresses.includes(eip.privateAddress),
            true,
            `Address failed match ${eip.privateAddress} to ${privateAddresses}`
        );
    });
}

function matchRouteTables(routeTables, nics) {
    const routeGroupDefinitions = deploymentDeclaration.failoverRoutes.routeGroupDefinitions;
    const routes = Array.prototype.concat.apply(
        [], routeTables.map(routeTable => routeTable.Routes.map(route => route))
    );

    routes.forEach((route) => {
        const cidrBlock = route.DestinationCidrBlock || route.DestinationIpv6CidrBlock;
        if (routeGroupDefinitions[0].scopingAddressRanges.map(i => i.range).includes(cidrBlock)) {
            assert.strictEqual(
                nics.includes(route.NetworkInterfaceId),
                true,
                `Route failed match ${route} to ${nics}`
            );
        }
    });
}

describe(`Provider: AWS ${deploymentInfo.networkTopology}`, () => {
    let ec2;
    let virtualAddresses = [];

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
                const options = funcUtils.makeOptions({ authToken: results[0].token });
                return utils.makeRequest(dutPrimary.ip, '/mgmt/tm/ltm/virtual-address', options);
            })
            .then((result) => {
                virtualAddresses = result.items.map(i => i.address.split('/')[0]);
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

    function getElasticIpAddressesInfo() {
        return getElasticIps()
            .then(data => data.Addresses.map((address => ({
                privateAddress: address.PrivateIpAddress
            }))))
            .catch(err => Promise.reject(err));
    }

    function getIpv6Addresses(instanceId) {
        const ipv6Addresses = [];
        return Promise.resolve(
            getInstanceNics(instanceId)
        )
            .then((response) => {
                const params = {
                    NetworkInterfaceIds: response
                };
                return ec2.describeNetworkInterfaces(params).promise();
            })
            .then((response) => {
                response.NetworkInterfaces.forEach((nic) => {
                    if (nic.Ipv6Addresses && nic.Ipv6Addresses.length > 0) {
                        nic.Ipv6Addresses.forEach((address) => {
                            ipv6Addresses.push(address.Ipv6Address);
                        });
                    }
                });
                return Promise.resolve(ipv6Addresses);
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

    function checkElasticIPs(instance) {
        return Promise.all([
            getElasticIpAddressesInfo(),
            getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
        ])
            .then((results) => {
                const eips = results[0];
                const instanceData = results[1];
                const privateIpToInstance = {};

                Object.keys(instanceData).forEach((key) => {
                    privateIpToInstance[instanceData[key].PublicIpAddress] = {
                        InstanceId: key,
                        NetworkInterfaces: instanceData[key].NetworkInterfaces
                    };
                });
                matchElasticIpsToInstance(eips, privateIpToInstance[instance.ip]);
            })
            .catch(err => Promise.reject(err));
    }

    function checkRouteTables(instance) {
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

    function checkForIpv6Addresses(addresses) {
        let match = false;
        for (let i = 0; i < virtualAddresses.length; i += 1) {
            if (addresses.indexOf(virtualAddresses[i]) > -1) {
                match = true;
                break;
            }
        }
        // assert
        if (!match) {
            assert.fail('Matching ipv6 address not found');
        }
    }

    it('should ensure secondary is not primary', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
    ));

    it('should post declaration', () => {
        const uri = constants.DECLARE_ENDPOINT;
        return utils.makeRequest(dutPrimary.ip, uri, {
            method: 'POST',
            body: funcUtils.getDeploymentDeclaration(),
            headers: {
                'x-f5-auth-token': dutPrimary.authData.token
            },
            port: dutPrimary.port
        })
            .then((data) => {
                data = data || {};
                assert.strictEqual(data.message, 'success');
            })
            .catch(err => Promise.reject(err));
    });

    // Test IP and Route failover
    it('should check that Elastic IP is mapped to primary', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIPs(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
        it('should check that secondary IPv6 address is  mapped to primary ', function () {
            this.retries(RETRIES.LONG);
            getIpv6Addresses(dutPrimary.instanceId)
                .then((addresses) => {
                    checkForIpv6Addresses(addresses);
                })
                .catch(err => Promise.reject(err));
        });
    }

    it('should check AWS route table routes for next hop matches primary', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTables(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
    ));

    it('should check that Elastic IP is mapped to secondary', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIPs(dutSecondary)
            .catch(err => Promise.reject(err));
    });

    if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
        it('should check that secondary IPv6 address is  mapped to secondary ', function () {
            this.retries(RETRIES.LONG);
            return getIpv6Addresses(dutSecondary.instanceId)
                .then((addresses) => {
                    checkForIpv6Addresses(addresses);
                })
                .catch(err => Promise.reject(err));
        });
    }

    it('should check AWS route table routes for next hop matches secondary', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTables(dutSecondary)
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

    it('should check that Elastic IP is mapped to primary', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIPs(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('should check AWS route table routes for next hop matches primary', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTables(dutPrimary)
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
                    hostname: dutSecondary.hostname,
                    port: dutSecondary.port
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
                    hostname: dutPrimary.hostname,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should check that Elastic IP is mapped to primary', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIPs(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    it('Flapping scenario: should check AWS route table routes for next hop matches primary', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTables(dutPrimary)
            .catch(err => Promise.reject(err));
    });


    it('Should retrieve addresses and routes for primary', function () {
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

    it('Should retrieve addresses and not routes for secondary', function () {
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

    it('Dry run: should retrieve failover objects that will change when standby  BIG-IP (secondary) becomes active', () => {
        const expectedResult = {};
        return Promise.all([
            getElasticIps(dutPrimary.instanceId),
            getRouteTableRoutes(dutPrimary.instanceId)
        ])
            .then((data) => {
                expectedResult.publicIp = data[0].Addresses[0].PublicIp;
                expectedResult.routeTableId = data[1][0].RouteTableId;
            })
            .then(() => funcUtils.invokeFailoverDryRun(dutSecondary.ip,
                {
                    authToken: dutSecondary.authData.token,
                    port: dutSecondary.port
                }))
            .then((data) => {
                const addresses = utils.stringify(data.addresses);
                const routeTableId = data.routes.operations[0].routeTableId;
                assert(addresses.indexOf(expectedResult.publicIp) !== -1);
                assert.deepStrictEqual(routeTableId, expectedResult.routeTableId);
            })
            .catch(err => Promise.reject(err));
    });
});
