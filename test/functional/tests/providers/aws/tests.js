/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const AWS = require('aws-sdk');

const CIDR = require('cidr-js');

const constants = require('../../../../constants.js');
const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const RETRIES = constants.RETRIES;

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter((dut) => dut.primary)[0];
const dutSecondary = duts.filter((dut) => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();
const deploymentDeclaration = funcUtils.getDeploymentDeclaration('exampleDeclaration.stache');
let staticDeclarationName = 'exampleDeclarationAwsStatic.stache';

// Helper functions
function matchElasticIpsToInstance(eips, instance) {
    const privateAddresses = Array.prototype.concat.apply(
        [], instance.NetworkInterfaces.map((nic) => nic.PrivateIpAddresses.map((ip) => ip.PrivateIpAddress))
    );

    eips.forEach((eip) => {
        if (typeof eip.privateAddress === 'undefined') {
            return;
        }
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
        [], routeTables.map((routeTable) => routeTable.Routes.map((route) => route))
    );

    routes.forEach((route) => {
        const cidrBlock = route.DestinationCidrBlock || route.DestinationIpv6CidrBlock;
        if (routeGroupDefinitions[0].scopingAddressRanges.map((i) => i.range).includes(cidrBlock)) {
            assert.strictEqual(
                nics.includes(route.NetworkInterfaceId),
                true,
                `Route failed match ${route} to ${nics}`
            );
        }
    });
}

describe(`Provider: AWS ${deploymentInfo.networkTopology}`, () => {
    const ha = {
        active: dutPrimary,
        standby: dutSecondary
    };
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

                const options = funcUtils.makeOptions({ authToken: dutPrimary.authData.token });
                options.port = dutPrimary.port;

                return utils.makeRequest(dutPrimary.ip, '/mgmt/tm/ltm/virtual-address', options);
            })
            .then((result) => {
                virtualAddresses = result.items.map((i) => i.address.split('/')[0]);
            })
            .catch((err) => Promise.reject(err));
    });

    beforeEach(() => Promise.all([
        utils.refreshOrGetAuthToken(
            dutPrimary.ip,
            dutPrimary.port,
            dutPrimary.username,
            dutPrimary.password,
            dutPrimary.authData.token
        ),
        utils.refreshOrGetAuthToken(
            dutSecondary.ip,
            dutSecondary.port,
            dutSecondary.username,
            dutSecondary.password,
            dutSecondary.authData.token
        )
    ])
        .then((results) => {
            dutPrimary.authData = results[0];
            dutSecondary.authData = results[1];
        })
        .catch((err) => Promise.reject(err)));

    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        utils.revokeAuthToken(dutPrimary.ip, dutPrimary.port, dutPrimary.authData.token);
        utils.revokeAuthToken(dutSecondary.ip, dutSecondary.port, dutSecondary.authData.token);
    });

    // local functions
    function setHaStatus() {
        const uri = '/mgmt/tm/shared/bigip-failover-state';
        const options = funcUtils.makeOptions({ authToken: dutPrimary.authData.token });
        options.port = dutPrimary.port;
        return utils.makeRequest(dutPrimary.ip, uri, options)
            .then((data) => {
                const primaryIsActive = (data.failoverState === 'active');
                ha.active = primaryIsActive ? dutPrimary : dutSecondary;
                ha.standby = primaryIsActive ? dutSecondary : dutPrimary;
            });
    }

    function pollTaskState(dut, desiredStates, opts) {
        const start = Date.now();
        const timeout = opts.timeout || 60000;
        const interval = opts.interval || 5000;

        function attempt() {
            return funcUtils.getTriggerTaskStatus(dut.ip, {
                taskStates: [constants.FAILOVER_STATES.PASS],
                authToken: dut.authData.token,
                port: dut.port
            })
                .then((data) => {
                    if (data.boolean && desiredStates.includes(data.taskStateResponse.taskState)) {
                        return data;
                    }
                    if (Date.now() - start >= timeout) {
                        return Promise.reject(new Error(`Timeout waiting for taskState in ${desiredStates} got: ${utils.stringify(data)}`));
                    }
                    return new Promise((resolve) => setTimeout(resolve, interval)).then(attempt);
                });
        }
        return attempt();
    }

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
                .catch((err) => reject(err));
        });
    }

    function getElasticIpAddressesInfo() {
        return getElasticIps()
            .then((data) => data.Addresses.map(((address) => ({
                privateAddress: address.PrivateIpAddress
            }))))
            .catch((err) => Promise.reject(err));
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
                .then((data) => resolve(data))
                .catch((err) => reject(err));
        });
    }

    function getPrivateLinkEni(privateLinkId) {
        const params = {
            VpcEndpointIds: privateLinkId
        };

        return new Promise((resolve, reject) => {
            ec2.describeVpcEndpoints(params).promise()
                .then((data) => {
                    if (data.VpcEndpoints && data.VpcEndpoints.length > 0) {
                        resolve(data.VpcEndpoints[0].NetworkInterfaceIds);
                    } else {
                        reject(new Error(`No VPC endpoints found for id ${privateLinkId}`));
                    }
                })
                .catch((err) => reject(err));
        });
    }

    function getPrivateEniIp(eniId) {
        let privateIpaddress = '';
        const ipParams = {
            NetworkInterfaceIds: eniId
        };

        return Promise.resolve(
            ec2.describeNetworkInterfaces(ipParams).promise()
        )
            .then((response) => {
                response.NetworkInterfaces.forEach((nic) => {
                    if (nic.PrivateIpAddress && nic.PrivateIpAddress.length > 0) {
                        privateIpaddress = nic.PrivateIpAddress;
                    }
                });
                return Promise.resolve(privateIpaddress);
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
                    const nics = data.NetworkInterfaces.map((nic) => nic.NetworkInterfaceId);
                    resolve(nics);
                })
                .catch((err) => reject(err));
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
                .catch((err) => reject(err));
        });
    }

    function checkElasticIPs(instance) {
        return Promise.all([
            getElasticIpAddressesInfo(),
            getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
        ])
            .then(([eips, instanceData]) => {
                const privateIpToInstance = {};

                Object.keys(instanceData).forEach((key) => {
                    privateIpToInstance[instanceData[key].PublicIpAddress] = {
                        InstanceId: key,
                        NetworkInterfaces: instanceData[key].NetworkInterfaces
                    };
                });
                matchElasticIpsToInstance(eips, privateIpToInstance[instance.ip]);
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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

    describe('AWS provider tests (tag discovery)', () => {
        it('should post declaration (tag discovery)', () => {
            const uri = constants.DECLARE_ENDPOINT;
            return utils.makeRequest(dutPrimary.ip, uri, {
                method: 'POST',
                body: funcUtils.getDeploymentDeclaration('exampleDeclarationTags.stache'),
                headers: {
                    'x-f5-auth-token': dutPrimary.authData.token
                },
                port: dutPrimary.port
            })
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.message, 'success');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should ensure secondary is not active', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000);

            const dut = dutSecondary;
            return funcUtils.forceStandby(dut.ip, dut.port, dut.username, dut.password)
                .then(() => pollTaskState(dut, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                });
        });

        // Test IP and Route failover
        it('should check that Elastic IP is mapped to primary (tag discovery)', function () {
            this.retries(RETRIES.LONG);
            return checkElasticIPs(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
            it('should check that secondary IPv6 address is mapped to primary (tag discovery)', function () {
                this.retries(RETRIES.LONG);
                getIpv6Addresses(dutPrimary.instanceId)
                    .then((addresses) => {
                        checkForIpv6Addresses(addresses);
                    })
                    .catch((err) => Promise.reject(err));
            });
        }

        it('should check AWS route table routes for next hop matches primary (tag discovery)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('should force BIG-IP (primary) to standby (tag discovery)', () => funcUtils.forceStandby(
            dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
        ));

        it('wait until taskState is success on secondary BIG-IP (tag discovery)', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000); // Allow enough time for cold tag discovery + retries

            return new Promise(
                (resolve) => setTimeout(resolve, 5000)
            )
                .then(() => pollTaskState(dutSecondary, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check that Elastic IP is mapped to secondary (tag discovery)', function () {
            this.retries(RETRIES.LONG);

            return checkElasticIPs(dutSecondary)
                .catch((err) => Promise.reject(err));
        });

        // might need to be skipped if none of the returned ipv6 addresses are also a virtualAddress in tmsh
        if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
            it('should check that secondary IPv6 address is mapped to secondary (tag discovery)', function () {
                this.retries(RETRIES.LONG);
                this.retries(1);
                return getIpv6Addresses(dutSecondary.instanceId)
                    .then((addresses) => checkForIpv6Addresses(addresses))
                    .catch((err) => Promise.reject(err));
            });
        }

        it('should check AWS route table routes for next hop matches secondary (tag discovery)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutSecondary)
                .catch((err) => Promise.reject(err));
        });

        it('should force BIG-IP (secondary) to standby (tag discovery)', () => funcUtils.forceStandby(
            dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
        ));

        it('wait until taskState is success on primary BIG-IP (tag discovery)', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000);
            return new Promise((resolve) => setTimeout(resolve, 5000))
                .then(() => pollTaskState(dutPrimary, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check that Elastic IP is mapped to primary (tag discovery)', function () {
            this.retries(RETRIES.LONG);

            return checkElasticIPs(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('should check AWS route table routes for next hop matches primary (tag discovery)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('Should retrieve addresses and routes for primary (tag discovery)', function () {
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
                .catch((err) => Promise.reject(err));
        });

        it('Should retrieve addresses and not routes for secondary (tag discovery)', function () {
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
                .catch((err) => Promise.reject(err));
        });

        // might need to be skipped if ipv6 public ip missing
        it('Dry run: should retrieve failover objects that will change when standby BIG-IP (secondary) becomes active (tag discovery)', () => {
            const expectedResult = {};
            return Promise.all([
                getElasticIps(dutPrimary.instanceId),
                getRouteTableRoutes(dutPrimary.instanceId)
            ])
                .then((data) => {
                    expectedResult.publicIp = data[0].Addresses[0].PublicIp;
                    expectedResult.routeTableId = data[1][0].RouteTableId;
                    return funcUtils.invokeFailoverDryRun(dutSecondary.ip,
                        {
                            authToken: dutSecondary.authData.token,
                            port: dutSecondary.port
                        });
                })
                .then((data) => {
                    const addresses = utils.stringify(data.addresses);
                    const routeTableId = data.routes.operations[0].route;
                    assert(addresses.indexOf(expectedResult.publicIp) !== -1);
                    assert.deepStrictEqual(routeTableId, expectedResult.routeTableId);
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('AWS provider tests (static definitions)', () => {
        it('should post declaration (static definitions)', () => {
            const uri = constants.DECLARE_ENDPOINT;
            if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
                staticDeclarationName = 'exampleDeclarationAwsSameAzStatic.stache';
            }

            return utils.makeRequest(dutPrimary.ip, uri, {
                method: 'POST',
                body: funcUtils.getDeploymentDeclaration(staticDeclarationName),
                headers: {
                    'x-f5-auth-token': dutPrimary.authData.token
                },
                port: dutPrimary.port
            })
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.message, 'success');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should ensure secondary is not active (static definitions)', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000);

            const dut = dutSecondary;
            return funcUtils.forceStandby(dut.ip, dut.port, dut.username, dut.password)
                .then(() => pollTaskState(dut, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                });
        });

        it('should check that Elastic IP is mapped to primary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkElasticIPs(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
            it('should check that secondary IPv6 address is mapped to primary (static definitions)', function () {
                this.retries(RETRIES.LONG);
                getIpv6Addresses(dutPrimary.instanceId)
                    .then((addresses) => {
                        checkForIpv6Addresses(addresses);
                    })
                    .catch((err) => Promise.reject(err));
            });
        }

        it('should check AWS route table routes for next hop matches primary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('should force BIG-IP (primary) to standby (static definitions)', () => funcUtils.forceStandby(
            dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
        ));

        it('wait until taskState is success on secondary BIG-IP (static definitions)', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000);

            return new Promise(
                (resolve) => setTimeout(resolve, 5000)
            )
                .then(() => pollTaskState(dutSecondary, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check that Elastic IP is mapped to secondary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkElasticIPs(dutSecondary)
                .catch((err) => Promise.reject(err));
        });

        // might need to be skipped if none of the returned ipv6 addresses are also a virtualAddress in tmsh
        if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
            it('should check that secondary IPv6 address is mapped to secondary (static definitions)', function () {
                this.retries(RETRIES.LONG);
                return getIpv6Addresses(dutSecondary.instanceId)
                    .then((addresses) => {
                        checkForIpv6Addresses(addresses);
                    })
                    .catch((err) => Promise.reject(err));
            });
        }

        it('should check AWS route table routes for next hop matches secondary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutSecondary)
                .catch((err) => Promise.reject(err));
        });

        it('should force BIG-IP (secondary) to standby (static definitions)', () => funcUtils.forceStandby(
            dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
        ));

        it('wait until taskState is success on primary BIG-IP (static definitions)', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000);
            return new Promise(
                (resolve) => setTimeout(resolve, 5000)
            )
                .then(() => pollTaskState(dutPrimary, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check that Elastic IP is mapped to primary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkElasticIPs(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('should check AWS route table routes for next hop matches primary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        // Flapping scenario: should check failover objects get assigned back to BIG-IP (primary)
        it('Flapping scenario: should force BIG-IP (primary) to standby (static definitions)', () => funcUtils.forceStandby(
            dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
        ));

        it('wait until taskState is running (or succeeded) on standby BIG-IP (static definitions)', function () {
            this.retries(RETRIES.MEDIUM);
            return new Promise(
                (resolve) => setTimeout(resolve, 1000)
            )
                .then(() => pollTaskState(dutSecondary, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('Flapping scenario: should force BIG-IP (secondary) to standby (static definitions)', () => funcUtils.forceStandby(
            dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
        ));

        it('wait until taskState is success on primary BIG-IP (static definitions)', function () {
            this.retries(RETRIES.MEDIUM);
            this.timeout(500000);
            return new Promise(
                (resolve) => setTimeout(resolve, 5000)
            )
                .then(() => pollTaskState(dutPrimary, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('Flapping scenario: should check that Elastic IP is mapped to primary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkElasticIPs(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('Flapping scenario: should check AWS route table routes for next hop matches primary (static definitions)', function () {
            this.retries(RETRIES.LONG);

            return checkRouteTables(dutPrimary)
                .catch((err) => Promise.reject(err));
        });

        it('Should retrieve addresses and routes for primary (static definitions)', function () {
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
                .catch((err) => Promise.reject(err));
        });

        it('Should retrieve addresses and not routes for secondary (static definitions)', function () {
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
                .catch((err) => Promise.reject(err));
        });

        // might need to be skipped if ipv6 public ip missing
        it('Dry run: should retrieve failover objects that will change when standby BIG-IP (secondary) becomes active (static definitions)', () => {
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
                    const routeTableId = data.routes.operations[0].route;
                    assert(addresses.indexOf(expectedResult.publicIp) !== -1);
                    assert.deepStrictEqual(routeTableId, expectedResult.routeTableId);
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('AWS provider config reset', () => {
        it('should post declaration (legacy)', () => {
            const uri = constants.DECLARE_ENDPOINT;
            return utils.makeRequest(dutPrimary.ip, uri, {
                method: 'POST',
                body: funcUtils.getDeploymentDeclaration('exampleDeclaration.stache'),
                headers: {
                    'x-f5-auth-token': dutPrimary.authData.token
                },
                port: dutPrimary.port
            })
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.message, 'success');
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('Functional: AWS China region domain suffix', () => {
        it('should update domainSuffix to amazonaws.com.cn for cn-north-1 region', () => {
            // Cannot really functional test this more without incurring costs in the China region
            // -- which we do not even have credentials for at this time.
            // Also, in order to functional test this better, we could create a new endpoint
            // eslint-disable-next-line global-require
            const AWSCloudProvider = require('../../../../../src/nodejs/providers/aws/cloud.js').Cloud;
            const provider = new AWSCloudProvider({ region: 'cn-north-1' });
            provider.region = 'cn-north-1';
            const suffix = provider._getDomainSuffix();
            assert.strictEqual(suffix, 'amazonaws.com.cn');
        });
    });

    if (dutPrimary.port !== 8443 && deploymentInfo.networkTopology === 'sameNetwork') {
        describe('AWS provider tests (same AZ prefix)', () => {
            const cidr = new CIDR();
            let NetworkInterfaceId;
            let expectedPrefixCidr;
            let allocationId;

            before(() => setHaStatus()
                .then(() => getExternalNic(ha.active.instanceId))
                .then((extNic) => {
                    NetworkInterfaceId = extNic.NetworkInterfaceId;
                    return ((extNic.Ipv4Prefixes.length > 0)
                        ? { prefixCidrs: extNic.Ipv4Prefixes.map((p) => p.Ipv4Prefix) }
                        : assignEniWithPrefix());
                })
                .then((eni) => {
                    assert(eni.prefixCidrs && eni.prefixCidrs.length > 0, 'No prefix CIDRs found on active instance ENI');
                    expectedPrefixCidr = eni.prefixCidrs[0];
                    process.env.SCOPING_ADDRESS = expectedPrefixCidr;
                })
                .then(() => utils.makeRequest(ha.active.ip, constants.DECLARE_ENDPOINT, {
                    method: 'POST',
                    body: funcUtils.getDeploymentDeclaration('exampleDeclarationAwsSameAzPrefix.stache'),
                    headers: { 'x-f5-auth-token': ha.active.authData.token },
                    port: ha.active.port
                }))
                .then((resp) => {
                    resp = resp || {};
                    assert.strictEqual(resp.message, 'success', `Declaration failed: ${utils.stringify(resp)}`);
                })
                .then(() => setHaStatus()));

            after(() => (allocationId
                ? ec2.describeAddresses({ AllocationIds: [allocationId] }).promise()
                    .then((eip) => ((eip.Addresses && eip.Addresses.length && eip.Addresses[0].AssociationId)
                        ? ec2.disassociateAddress({ AssociationId: eip.Addresses[0].AssociationId }).promise()
                            .then(() => ec2.releaseAddress({ AllocationId: allocationId }).promise())
                            .then(() => ec2.unassignPrivateIpAddresses({
                                NetworkInterfaceId: eip.Addresses[0].NetworkInterfaceId,
                                Ipv4Prefixes: [expectedPrefixCidr]
                            }).promise())
                            .catch((err) => Promise.reject(err))
                        : Promise.resolve()))
                : Promise.resolve()));

            /**
             * Returns the external ENI (Elastic Network Interface) for the specified EC2 Instance
             * @param {string} instanceId - The EC2 Instance ID to get the external ENI for
             * @returns {Promise}         - Resolves with the ENI data on the external NIC
             */
            function getExternalNic(instanceId) {
                const params = {
                    Filters: [{
                        Name: 'attachment.instance-id',
                        Values: [instanceId]
                    },
                    {
                        Name: 'tag:f5_cloud_failover_nic_map',
                        Values: ['external']
                    }]
                };
                return new Promise((resolve, reject) => {
                    ec2.describeNetworkInterfaces(params).promise()
                        .then((data) => {
                            if (data.NetworkInterfaces.length === 0) {
                                return reject(new Error('No external ENI found for instance'));
                            }
                            return resolve(data.NetworkInterfaces[0]);
                        })
                        .catch((err) => reject(err));
                });
            }

            /**
             * Assigns an IPv4 prefix to the specified ENI (Elastic Network Interface)
             * @param {string} networkEniId - The Network Interface ID to assign the prefix to
             * @returns {Promise}           - Resolves when the prefix is assigned
             */
            function assignEniWithPrefix() {
                let prefixCidrs = [];

                return ec2.assignPrivateIpAddresses({
                    NetworkInterfaceId,
                    Ipv4PrefixCount: 1
                }).promise()
                    .then((assignResp) => {
                        prefixCidrs = (assignResp.AssignedIpv4Prefixes || []).map((p) => p.Ipv4Prefix);
                        return ec2.allocateAddress({ NetworkBorderGroup: ha.active.region }).promise();
                    })
                    .then((allocateResp) => {
                        allocationId = allocateResp.AllocationId;
                        return ec2.associateAddress({
                            NetworkBorderGroup: ha.active.region,
                            AllocationId: allocateResp.AllocationId,
                            NetworkInterfaceId,
                            PrivateIpAddress: prefixCidrs[0].split('/')[0],
                            AllowReassociation: true
                        }).promise();
                    })
                    .then(() => Promise.resolve({ prefixCidrs }))
                    .catch((err) => Promise.reject(err));
            }

            /**
             * Checks if the given IP address is within the specified CIDR block
             * @param {string} ip        - The IP address to check
             * @param {string} cidrBlock - The CIDR block to check against
             * @returns {boolean}        - True if the IP is within the CIDR block, false otherwise
             */
            function ipInPrefix(ip, cidrBlock) {
                const ips = cidr.list(cidrBlock);
                return ips.includes(ip);
            }

            it('should verify IPv4 prefixes on active BIG-IP external ENI', () => funcUtils.getInspectStatus(ha.active.ip, {
                authToken: ha.active.authData.token,
                port: ha.active.port
            })
                .then((inspect) => {
                    assert(Array.isArray(inspect.addresses), 'Inspect addresses missing');
                    assert(inspect.addresses.some((a) => (a.privateIpAddress
                        && a.ipv4Prefix && a.ipv4Prefix === expectedPrefixCidr
                        && ipInPrefix(a.privateIpAddress, expectedPrefixCidr)
                    )), `Inspect did not report any address in prefix ${expectedPrefixCidr}`);
                })
                .then(() => new Promise((resolve) => setTimeout(resolve, 25000))));

            it('dry run should list operations referencing prefix CIDR before standby becomes active', () => funcUtils.invokeFailoverDryRun(ha.standby.ip, {
                authToken: ha.standby.authData.token,
                port: ha.standby.port
            })
                .then((dry) => {
                    const found = dry.addresses.operations.toStandby.filter((i) => (
                        i.networkInterface === NetworkInterfaceId
                        && (i.addresses.some((a) => a.address === expectedPrefixCidr && a.prefix))
                    ));
                    assert(found.length > 0, `No operations found referencing prefix CIDR ${expectedPrefixCidr} on ENI ${NetworkInterfaceId}`);
                }));

            it('should failover and list operations referencing prefix CIDR on newly active peer', function () {
                this.retries(RETRIES.MEDIUM);

                return funcUtils.forceStandby(ha.active.ip, ha.active.port, ha.active.username, ha.active.password)
                    .then(() => pollTaskState(ha.standby, [constants.FAILOVER_STATES.PASS], {}))
                    .then((data) => {
                        assert(data.boolean, data);
                    })
                    .then(() => funcUtils.getInspectStatus(ha.standby.ip, {
                        authToken: ha.standby.authData.token,
                        port: ha.standby.port
                    }))
                    .then((inspect) => {
                        assert(Array.isArray(inspect.addresses), 'Inspect addresses missing');
                        assert(inspect.addresses.some((a) => (a.privateIpAddress
                            && a.ipv4Prefix && a.ipv4Prefix === expectedPrefixCidr
                            && ipInPrefix(a.privateIpAddress, expectedPrefixCidr)
                        )), `Inspect did not report any address in prefix ${expectedPrefixCidr}`);
                    });
            });
        });

        describe('AWS provider tests (PrivateLink to S3 and EC2)', () => {
            const cidr = new CIDR();
            let NetworkInterfaceId;
            let expectedPrefixCidr;
            let allocationId;

            /**
             * Returns the external ENI (Elastic Network Interface) for the specified EC2 Instance
             * @param {string} instanceId - The EC2 Instance ID to get the external ENI for
             * @returns {Promise}         - Resolves with the ENI data on the external NIC
             */
            function getExternalNic(instanceId) {
                const params = {
                    Filters: [{
                        Name: 'attachment.instance-id',
                        Values: [instanceId]
                    },
                    {
                        Name: 'tag:f5_cloud_failover_nic_map',
                        Values: ['external']
                    }]
                };
                return new Promise((resolve, reject) => {
                    ec2.describeNetworkInterfaces(params).promise()
                        .then((data) => {
                            if (data.NetworkInterfaces.length === 0) {
                                return reject(new Error('No external ENI found for instance'));
                            }
                            return resolve(data.NetworkInterfaces[0]);
                        })
                        .catch((err) => reject(err));
                });
            }

            /**
             * Assigns an IPv4 prefix to the specified ENI (Elastic Network Interface)
             * @param {string} networkEniId - The Network Interface ID to assign the prefix to
             * @returns {Promise}           - Resolves when the prefix is assigned
             */
            function assignEniWithPrefix() {
                let prefixCidrs = [];

                return ec2.assignPrivateIpAddresses({
                    NetworkInterfaceId,
                    Ipv4PrefixCount: 1
                }).promise()
                    .then((assignResp) => {
                        prefixCidrs = (assignResp.AssignedIpv4Prefixes || []).map((p) => p.Ipv4Prefix);
                        return ec2.allocateAddress({ NetworkBorderGroup: ha.active.region }).promise();
                    })
                    .then((allocateResp) => {
                        allocationId = allocateResp.AllocationId;
                        return ec2.associateAddress({
                            NetworkBorderGroup: ha.active.region,
                            AllocationId: allocateResp.AllocationId,
                            NetworkInterfaceId,
                            PrivateIpAddress: prefixCidrs[0].split('/')[0],
                            AllowReassociation: true
                        }).promise();
                    })
                    .then(() => Promise.resolve({ prefixCidrs }))
                    .catch((err) => Promise.reject(err));
            }

            before(() => setHaStatus()
                .then(() => getExternalNic(ha.active.instanceId))
                .then((extNic) => {
                    NetworkInterfaceId = extNic.NetworkInterfaceId;
                    return ((extNic.Ipv4Prefixes.length > 0)
                        ? { prefixCidrs: extNic.Ipv4Prefixes.map((p) => p.Ipv4Prefix) }
                        : assignEniWithPrefix());
                })
                .then((eni) => {
                    assert(eni.prefixCidrs && eni.prefixCidrs.length > 0, 'No prefix CIDRs found on active instance ENI');
                    expectedPrefixCidr = eni.prefixCidrs[0];
                    process.env.SCOPING_ADDRESS = expectedPrefixCidr;
                })
                .then(() => {
                    process.env.STORAGE_DNS_NAME = deploymentInfo.storageDnsName;
                    process.env.EC2_DNS_NAME = deploymentInfo.ec2DnsName;
                })
                .then(() => Promise.all([
                    getPrivateLinkEni(deploymentInfo.storagePrivateLinkId),
                    getPrivateLinkEni(deploymentInfo.ec2PrivateLinkId)
                ]))
                .then(([storageEni, ec2Eni]) => Promise.all([
                    getPrivateEniIp(storageEni),
                    getPrivateEniIp(ec2Eni),
                    getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
                ]))
                .then(([s3IpAddress, ec2IpAddress, ec2s]) => ({ s3IpAddress, ec2IpAddress, ec2s }))
                .then((data) => {
                    const mgmtEni = data.ec2s[ha.active.instanceId].NetworkInterfaces.filter((eni) => eni.Description === 'Management Interface for BIG-IP')[0];
                    const params = {
                        DryRun: false,
                        GroupId: mgmtEni.Groups[0].GroupId,
                        IpPermissions: [{
                            IpProtocol: 'All',
                            FromPort: -1,
                            ToPort: -1,
                            IpRanges: [{
                                CidrIp: '0.0.0.0/0'
                            }]
                        }]
                    };
                    const params2 = {
                        DryRun: false,
                        GroupId: mgmtEni.Groups[0].GroupId,
                        IpPermissions: [{
                            IpProtocol: 'All',
                            FromPort: -1,
                            ToPort: -1,
                            IpRanges: [{
                                CidrIp: `${data.s3IpAddress}/32`,
                                Description: 'Allow all traffic to S3 PrivateLink Endpoint'
                            }]
                        }]
                    };
                    const params3 = {
                        DryRun: false,
                        GroupId: mgmtEni.Groups[0].GroupId,
                        IpPermissions: [{
                            IpProtocol: 'All',
                            FromPort: -1,
                            ToPort: -1,
                            IpRanges: [{
                                CidrIp: `${data.ec2IpAddress}/32`,
                                Description: 'Allow all traffic to EC2 PrivateLink Endpoint'
                            }]
                        }]
                    };
                    return ec2.revokeSecurityGroupEgress(params).promise()
                        .then(() => ec2.authorizeSecurityGroupEgress(params2).promise())
                        .then(() => ec2.authorizeSecurityGroupEgress(params3).promise());
                })
                .then(() => utils.makeRequest(ha.active.ip, constants.DECLARE_ENDPOINT, {
                    method: 'POST',
                    body: funcUtils.getDeploymentDeclaration('exampleDeclarationAwsPrivateLink.stache'),
                    headers: { 'x-f5-auth-token': ha.active.authData.token },
                    port: ha.active.port
                }))
                .then((resp) => {
                    resp = resp || {};
                    assert.strictEqual(resp.message, 'success', `Declaration failed: ${utils.stringify(resp)}`);
                }));

            beforeEach(() => setHaStatus()
                .then(() => utils.makeRequest(ha.active.ip, constants.RESET_ENDPOINT, {
                    method: 'POST',
                    port: ha.active.port,
                    headers: {
                        'x-f5-auth-token': ha.active.authData.token
                    },
                    body: { resetStateFile: true }
                }))
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.message, constants.STATE_FILE_RESET_MESSAGE);
                })
                .then(() => new Promise((resolve) => setTimeout(resolve, 30000))));

            after(() => {
                const basePromise = allocationId
                    ? ec2.describeAddresses({ AllocationIds: [allocationId] }).promise()
                        .then((eip) => ((eip.Addresses && eip.Addresses.length && eip.Addresses[0].AssociationId)
                            ? ec2.disassociateAddress({ AssociationId: eip.Addresses[0].AssociationId }).promise()
                                .then(() => ec2.releaseAddress({ AllocationId: allocationId }).promise())
                                .then(() => ec2.unassignPrivateIpAddresses({
                                    NetworkInterfaceId: eip.Addresses[0].NetworkInterfaceId,
                                    Ipv4Prefixes: [expectedPrefixCidr]
                                }).promise())
                                .catch((err) => Promise.reject(err))
                            : Promise.resolve()))
                    : Promise.resolve();

                return basePromise
                    .then(() => Promise.all([
                        getPrivateLinkEni(deploymentInfo.storagePrivateLinkId),
                        getPrivateLinkEni(deploymentInfo.ec2PrivateLinkId)
                    ]))
                    .then(([storageEni, ec2Eni]) => Promise.all([
                        getPrivateEniIp(storageEni),
                        getPrivateEniIp(ec2Eni),
                        getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
                    ]))
                    .then(([s3IpAddress, ec2IpAddress, ec2s]) => ({ s3IpAddress, ec2IpAddress, ec2s }))
                    .then((data) => {
                        const mgmtEni = data.ec2s[ha.active.instanceId].NetworkInterfaces.filter((eni) => eni.Description === 'Management Interface for BIG-IP')[0];
                        const params = {
                            DryRun: false,
                            GroupId: mgmtEni.Groups[0].GroupId,
                            IpPermissions: [{
                                IpProtocol: 'All',
                                FromPort: -1,
                                ToPort: -1,
                                IpRanges: [{
                                    CidrIp: '0.0.0.0/0'
                                }]
                            }]
                        };
                        const params2 = {
                            DryRun: false,
                            GroupId: mgmtEni.Groups[0].GroupId,
                            IpPermissions: [{
                                IpProtocol: 'All',
                                FromPort: -1,
                                ToPort: -1,
                                IpRanges: [{
                                    CidrIp: `${data.s3IpAddress}/32`,
                                    Description: 'Allow all traffic to S3 PrivateLink Endpoint'
                                }]
                            }]
                        };
                        const params3 = {
                            DryRun: false,
                            GroupId: mgmtEni.Groups[0].GroupId,
                            IpPermissions: [{
                                IpProtocol: 'All',
                                FromPort: -1,
                                ToPort: -1,
                                IpRanges: [{
                                    CidrIp: `${data.ec2IpAddress}/32`,
                                    Description: 'Allow all traffic to EC2 PrivateLink Endpoint'
                                }]
                            }]
                        };
                        return ec2.revokeSecurityGroupEgress(params2).promise()
                            .then(() => ec2.revokeSecurityGroupEgress(params3).promise())
                            .then(() => ec2.authorizeSecurityGroupEgress(params).promise());
                    });
            });

            /**
             * Checks if the given IP address is within the specified CIDR block
             * @param {string} ip        - The IP address to check
             * @param {string} cidrBlock - The CIDR block to check against
             * @returns {boolean}        - True if the IP is within the CIDR block, false otherwise
             */
            function ipInPrefix(ip, cidrBlock) {
                const ips = cidr.list(cidrBlock);
                return ips.includes(ip);
            }

            it('should force the Active BIG-IP to Standby', () => funcUtils.forceStandby(
                ha.active.ip, ha.active.port, ha.active.username, ha.active.password
            )
                .then(() => pollTaskState(ha.standby, [constants.FAILOVER_STATES.PASS], {}))
                .then((data) => {
                    assert(data.boolean, data);
                })
                .then(() => checkElasticIPs(ha.standby))
                .catch((err) => Promise.reject(err)));

            it('should force the newly Active BIG-IP device back to Standby', function () {
                this.retries(RETRIES.MEDIUM);
                this.timeout(500000);

                return funcUtils.forceStandby(
                    ha.active.ip, ha.active.port, ha.active.username, ha.active.password
                )
                    .then(() => pollTaskState(ha.standby, [constants.FAILOVER_STATES.PASS], {}))
                    .then((data) => {
                        assert(data.boolean, data);
                    })
                    .then(() => setHaStatus())
                    .then(() => checkElasticIPs(ha.active))
                    .catch((err) => Promise.reject(err));
            });
            it('should verify IPv4 prefixes on active BIG-IP external ENI', () => funcUtils.getInspectStatus(ha.active.ip, {
                authToken: ha.active.authData.token,
                port: ha.active.port
            })
                .then((inspect) => {
                    assert(Array.isArray(inspect.addresses), 'Inspect addresses missing');
                    assert(inspect.addresses.some((a) => (a.privateIpAddress
                        && a.ipv4Prefix && a.ipv4Prefix === expectedPrefixCidr
                        && ipInPrefix(a.privateIpAddress, expectedPrefixCidr)
                    )), `Inspect did not report any address in prefix ${expectedPrefixCidr}`);
                })
                .then(() => new Promise((resolve) => setTimeout(resolve, 25000))));

            it('dry run should list operations referencing prefix CIDR before standby becomes active', () => funcUtils.invokeFailoverDryRun(ha.standby.ip, {
                authToken: ha.standby.authData.token,
                port: ha.standby.port
            })
                .then((dry) => {
                    const found = dry.addresses.operations.toStandby.filter((i) => (
                        i.networkInterface === NetworkInterfaceId
                        && (i.addresses.some((a) => a.address === expectedPrefixCidr && a.prefix))
                    ));
                    assert(found.length > 0, `No operations found referencing prefix CIDR ${expectedPrefixCidr} on ENI ${NetworkInterfaceId}`);
                }));

            it('should failover and list operations referencing prefix CIDR on newly active peer', function () {
                this.retries(RETRIES.MEDIUM);

                return funcUtils.forceStandby(ha.active.ip, ha.active.port, ha.active.username, ha.active.password)
                    .then(() => pollTaskState(ha.standby, [constants.FAILOVER_STATES.PASS], {}))
                    .then((data) => {
                        assert(data.boolean, data);
                    })
                    .then(() => funcUtils.getInspectStatus(ha.standby.ip, {
                        authToken: ha.standby.authData.token,
                        port: ha.standby.port
                    }))
                    .then((inspect) => {
                        assert(Array.isArray(inspect.addresses), 'Inspect addresses missing');
                        assert(inspect.addresses.some((a) => (a.privateIpAddress
                            && a.ipv4Prefix && a.ipv4Prefix === expectedPrefixCidr
                            && ipInPrefix(a.privateIpAddress, expectedPrefixCidr)
                        )), `Inspect did not report any address in prefix ${expectedPrefixCidr}`);
                    });
            });
            it('should post declaration (tag discovery without privateLink reference) and fail', () => {
                const uri = constants.DECLARE_ENDPOINT;
                return utils.makeRequest(dutPrimary.ip, uri, {
                    method: 'POST',
                    body: funcUtils.getDeploymentDeclaration('exampleDeclarationTags.stache'),
                    headers: {
                        'x-f5-auth-token': dutPrimary.authData.token
                    },
                    port: dutPrimary.port
                })
                    .then((data) => {
                        // If the request succeeds, this contradicts the test's expectation that it should fail.
                        data = data || {};
                        assert.fail(`Expected declaration POST to fail with HTTP Error, but it succeeded with message: ${data.message}`);
                    })
                    .catch((err) => {
                        assert(err.message.includes('Bad status code'), `Expected HTTP error, and got: ${err.message}`);
                    });
            });
        });
    }
});
