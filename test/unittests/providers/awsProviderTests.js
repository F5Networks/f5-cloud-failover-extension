/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line import/no-extraneous-dependencies

const cloud = 'aws';

describe('Provider - AWS', () => {
    let AWSCloudProvider;
    let provider;
    let metadataPathRequest;

    const mockInitData = {
        tags: {
            key1: 'value1',
            key2: 'value2'
        }
    };

    const mockMetadata = { region: 'us-west', instanceId: 'i-123' };

    const _getPrivateSecondaryIPsStubResponse = {
        '2.3.4.5': {
            NetworkInterfaceId: 'eni-2345'
        },
        '3.4.5.6': {
            NetworkInterfaceId: 'eni-3456'
        },
        '4.5.6.7': {
            NetworkInterfaceId: 'eni-3456'
        }
    };

    const _generateEIPConfigsStubResponse = {
        '1.1.1.1': {
            AllocationId: 'eipalloc-456',
            target: {
                NetworkInterfaceId: 'eni-2345',
                PrivateIpAddress: '2.3.4.5'
            },
            current: {
                AssociationId: 'eipassoc-123',
                PrivateIpAddress: '10.1.1.1'
            }
        },
        '2.2.2.2': {
            AllocationId: 'eipalloc-654',
            target: {
                NetworkInterfaceId: 'eni-3456',
                PrivateIpAddress: '3.4.5.6'
            },
            current: {
                AssociationId: 'eipassoc-321',
                PrivateIpAddress: '20.1.1.1'
            }
        }
    };

    const _getElasticIPsStubResponse = {
        Addresses: [
            {
                PublicIp: '1.2.3.4'
            }
        ]
    };

    before(() => {
        AWSCloudProvider = require('../../../src/nodejs/providers/aws/cloud.js').Cloud;
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    beforeEach(() => {
        provider = new AWSCloudProvider(mockInitData);

        provider.logger = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();

        provider.metadata.request = sinon.stub().callsFake((path, callback) => {
            metadataPathRequest = path;
            callback(null, JSON.stringify(mockMetadata));
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should validate constructor', () => {
        provider = new AWSCloudProvider(mockInitData);

        assert.strictEqual(provider.environment, cloud);
    });

    it('should initialize AWS provider', () => provider.init(mockInitData)
        .then(() => {
            assert.strictEqual(provider.region, mockMetadata.region);
            assert.strictEqual(provider.instanceId, mockMetadata.instanceId);
        })
        .catch(() => {
            assert.fail();
        }));

    describe('_getInstanceIdentityDoc function', () => {
        it('should call _getInstanceIdentityDoc to get instance data', () => provider._getInstanceIdentityDoc()
            .then(() => {
                assert.strictEqual(metadataPathRequest, '/latest/dynamic/instance-identity/document');
            })
            .catch(() => {
                assert.fail();
            }));

        it('should reject upon error', () => {
            const expectedError = 'cannot contact AWS metadata service';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.metadata.request = sinon.stub().callsFake((path, callback) => {
                        callback(new Error(expectedError, null));
                    });
                    return provider._getInstanceIdentityDoc();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });

    it('should initialize EC2 client with updated region', () => provider.init(mockInitData)
        .then(() => {
            assert.strictEqual(provider.ec2.config.region, mockMetadata.region);
        }));

    describe('_getElasticIPs function', () => {
        it('should get Elastic IPs from AWS', () => {
            let returnedParams;

            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeAddresses = sinon.stub().callsFake((params) => {
                        returnedParams = params;
                        return {
                            promise() {
                                return Promise.resolve(_getElasticIPsStubResponse);
                            }
                        };
                    });
                    return provider._getElasticIPs(mockInitData.tags);
                })
                .then((results) => {
                    assert.deepEqual(results, _getElasticIPsStubResponse);
                    assert.deepEqual(returnedParams, {
                        Filters: [
                            {
                                Name: 'tag:key1',
                                Values: ['value1']
                            },
                            {
                                Name: 'tag:key2',
                                Values: ['value2']
                            }
                        ]
                    });
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should reject upon error', () => {
            const expectedError = 'cannot describe the EIP adddresses';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.ec2.describeAddresses = sinon.stub().callsFake(() => {
                        return {
                            promise() {
                                return Promise.reject(new Error(expectedError));
                            }
                        };
                    });
                    return provider._getElasticIPs(mockInitData.tags);
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });

    describe('function _getPrivateSecondaryIPs', () => {
        const describeNetworkInterfacesResponse = {
            NetworkInterfaces: [
                {
                    NetworkInterfaceId: 'eni-2345',
                    PrivateIpAddresses: [
                        {
                            Primary: true,
                            PrivateIpAddress: '1.2.3.4'
                        },
                        {
                            Primary: false,
                            PrivateIpAddress: '2.3.4.5'
                        }
                    ]
                },
                {
                    NetworkInterfaceId: 'eni-3456',
                    PrivateIpAddresses: [
                        {
                            Primary: false,
                            PrivateIpAddress: '3.4.5.6'
                        },
                        {
                            Primary: false,
                            PrivateIpAddress: '4.5.6.7'
                        }
                    ]
                }
            ]
        };
        it('should get Private Secondary IPs from AWS', () => provider.init(mockInitData)
            .then(() => {
                // eslint-disable-next-line arrow-body-style
                provider.ec2.describeNetworkInterfaces = sinon.stub().callsFake(() => {
                    return {
                        promise() {
                            return Promise.resolve(describeNetworkInterfacesResponse);
                        }
                    };
                });
                return provider._getPrivateSecondaryIPs();
            })
            .then((results) => {
                assert.deepEqual(results, _getPrivateSecondaryIPsStubResponse);
            })
            .catch(() => {
                assert.fail();
            }));

        it('should pass correct parameters', () => {
            let passedParams;
            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeNetworkInterfaces = sinon.stub().callsFake((params) => {
                        passedParams = params;
                        return {
                            promise() {
                                return Promise.resolve(describeNetworkInterfacesResponse);
                            }
                        };
                    });
                    return provider._getPrivateSecondaryIPs();
                })
                .then(() => {
                    assert.deepEqual(passedParams,
                        {
                            Filters: [
                                {
                                    Name: 'attachment.instance-id',
                                    Values: [mockMetadata.instanceId]
                                }
                            ]
                        });
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should reject upon error', () => {
            const expectedError = 'cannot describe the Network Interfaces';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.ec2.describeNetworkInterfaces = sinon.stub().callsFake(() => {
                        return {
                            promise() {
                                return Promise.reject(new Error(expectedError));
                            }
                        };
                    });
                    return provider._getPrivateSecondaryIPs();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });

    describe('function _generateEIPConfigs', () => {
        const EIPdata = [
            {
                Tags: [
                    {
                        Key: 'VIPS',
                        Value: '2.3.4.5,2.3.4.6,2.3.4.7'
                    }
                ],
                PublicIp: '1.1.1.1',
                PrivateIpAddress: '10.1.1.1',
                AssociationId: 'eipassoc-123',
                AllocationId: 'eipalloc-456'
            },
            {
                Tags: [
                    {
                        Key: 'VIPS',
                        Value: '3.4.5.6,3.4.5.7,3.4.5.8'
                    }
                ],
                PublicIp: '2.2.2.2',
                PrivateIpAddress: '20.1.1.1',
                AssociationId: 'eipassoc-321',
                AllocationId: 'eipalloc-654'
            }
        ];

        it('should return correct Elastic IP configuration', () => provider.init(mockInitData)
            .then(() => provider._generateEIPConfigs(EIPdata, _getPrivateSecondaryIPsStubResponse))
            .then((results) => {
                assert.deepEqual(results, _generateEIPConfigsStubResponse);
            })
            .catch(() => {
                assert.fail();
            }));
    });

    describe('function _associateIpAddress', () => {
        const allocationId = 'eipalloc-0b5671ebba3628edd';
        const networkInterfaceId = 'eni-0157ac0f9506af78b';
        const privateIpAddress = '10.0.1.11';

        let passedParams;

        it('should pass correct parameters to AWS call', () => provider.init(mockInitData)
            .then(() => {
                provider.ec2.associateAddress = sinon.stub().callsFake((params) => {
                    passedParams = params;
                    return {
                        promise() {
                            return Promise.resolve();
                        }
                    };
                });
                return provider._associateIpAddress(allocationId, networkInterfaceId, privateIpAddress);
            })
            .then(() => {
                assert.deepEqual(passedParams, {
                    AllocationId: allocationId,
                    NetworkInterfaceId: networkInterfaceId,
                    PrivateIpAddress: privateIpAddress,
                    AllowReassociation: true
                });
            })
            .catch(() => {
                assert.fail();
            }));

        it('should reject upon error', () => {
            const expectedError = 'cannot associate Elastic IP';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.ec2.associateAddress = sinon.stub().callsFake(() => {
                        return {
                            promise() {
                                return Promise.reject(new Error(expectedError));
                            }
                        };
                    });
                    return provider._associateIpAddress();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });

    describe('function _disassociateIpAddress', () => {
        let passedParams;
        const associationIdToDisassociate = 'eipassoc-00523b2b8b8c01793';

        it('should pass correct parameters to AWS call', () => provider.init(mockInitData)
            .then(() => {
                provider.ec2.disassociateAddress = sinon.stub().callsFake((params) => {
                    passedParams = params;
                    return {
                        promise() {
                            return Promise.resolve();
                        }
                    };
                });
                return provider._disassociateIpAddress(associationIdToDisassociate);
            })
            .then(() => {
                assert.deepEqual(passedParams, {
                    AssociationId: associationIdToDisassociate
                });
            })
            .catch(() => {
                assert.fail();
            }));
    });

    describe('function _reassociateEIPs', () => {
        it('should call _disassociateIpAddress with correct params', () => {
            const passedParams = [];
            return provider.init(mockInitData)
                .then(() => {
                    provider._disassociateIpAddress = sinon.stub().callsFake((params) => {
                        passedParams.push(params);
                        return Promise.resolve();
                    });
                    provider._associateIpAddress = sinon.stub().resolves();

                    return provider._reassociateEIPs(_generateEIPConfigsStubResponse);
                })
                .then(() => {
                    assert.deepEqual(passedParams, ['eipassoc-123', 'eipassoc-321']);
                    assert.strictEqual(passedParams.length, 2);
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should call _associateIpAddress with correct params', () => {
            const passedParams = [];
            return provider.init(mockInitData)
                .then(() => {
                    provider._disassociateIpAddress = sinon.stub().resolves();
                    provider._associateIpAddress = sinon.stub().callsFake(
                        (allocationId, networkInterfaceId, privateIpAddress) => {
                            passedParams.push({
                                allocationId,
                                networkInterfaceId,
                                privateIpAddress
                            });
                            return Promise.resolve();
                        }
                    );

                    return provider._reassociateEIPs(_generateEIPConfigsStubResponse);
                })
                .then(() => {
                    assert.deepEqual(passedParams, [
                        {
                            allocationId: 'eipalloc-456',
                            networkInterfaceId: 'eni-2345',
                            privateIpAddress: '2.3.4.5'
                        },
                        {
                            allocationId: 'eipalloc-654',
                            networkInterfaceId: 'eni-3456',
                            privateIpAddress: '3.4.5.6'
                        }
                    ]);
                    assert.strictEqual(passedParams.length, 2);
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should not reject if there is no work to do', () => provider.init(mockInitData)
            .then(() => provider._reassociateEIPs([]))
            .then(() => {
                assert.ok(true);
            })
            .catch(() => {
                assert.fail();
            }));
    });

    describe('AWS Provider\'s updateAddress function', () => {
        it('should send correct parameters to EIP configuration function', () => {
            let passedParams;
            return provider.init(mockInitData)
                .then(() => {
                    provider._getElasticIPs = sinon.stub()
                        .resolves(_getElasticIPsStubResponse);
                    provider._getPrivateSecondaryIPs = sinon.stub()
                        .resolves(_getPrivateSecondaryIPsStubResponse);
                    provider._reassociateEIPs = sinon.stub()
                        .resolves();
                    provider._generateEIPConfigs = sinon.stub()
                        .callsFake((eips, secondaryPrivateIps) => {
                            passedParams = {
                                eips,
                                secondaryPrivateIps
                            };
                            return Promise.resolve();
                        });

                    return provider.updateAddresses();
                })
                .then(() => {
                    const elasticIps = _getElasticIPsStubResponse.Addresses;
                    assert.deepEqual(passedParams,
                        {
                            eips: elasticIps,
                            secondaryPrivateIps: _getPrivateSecondaryIPsStubResponse
                        });
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should send correct parameters to EIP reassociation function', () => {
            let passedParams;
            return provider.init(mockInitData)
                .then(() => {
                    provider._getElasticIPs = sinon.stub()
                        .resolves(_getElasticIPsStubResponse);
                    provider._getPrivateSecondaryIPs = sinon.stub()
                        .resolves(_getPrivateSecondaryIPsStubResponse);
                    provider._reassociateEIPs = sinon.stub()
                        .callsFake((EIPConfigs) => {
                            passedParams = EIPConfigs;
                            return Promise.resolve();
                        });
                    provider._generateEIPConfigs = sinon.stub()
                        .resolves(_generateEIPConfigsStubResponse);

                    return provider.updateAddresses();
                })
                .then(() => {
                    assert.deepEqual(passedParams, _generateEIPConfigsStubResponse);
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should reject upon error', () => {
            const expectedError = '_getPrivateSecondaryIPs error';
            return provider.init(mockInitData)
                .then(() => {
                    provider._getElasticIPs = sinon.stub()
                        .resolves();
                    provider._getPrivateSecondaryIPs = sinon.stub()
                        .rejects(new Error(expectedError));

                    return provider.updateAddresses();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });
    describe('function updateRoutes should', () => {
        it('update routes if route exists', () => {
            provider.init(mockInitData)
                .then(() => {
                    const routeTable = {
                        RouteTableId: 'rtb-123',
                        Routes: [
                            {
                                DestinationCidrBlock: '192.0.2.0/24',
                                InstanceId: 'i-123',
                                InstanceOwnerId: '123',
                                NetworkInterfaceId: 'eni-123',
                                Origin: 'CreateRoute',
                                State: 'active'
                            },
                            {
                                DestinationCidrBlock: '10.0.0.0/16',
                                GatewayId: 'local',
                                Origin: 'CreateRouteTable',
                                State: 'active'
                            },
                            {
                                DestinationCidrBlock: '0.0.0.0/0',
                                GatewayId: 'igw-123',
                                Origin: 'CreateRoute',
                                State: 'active'
                            }
                        ],
                        Tags: [
                            {
                                Key: 'F5_CLOUD_FAILOVER_LABEL',
                                Value: 'foo'
                            },
                            {
                                Key: 'F5_SELF_IPS',
                                Value: '10.0.1.211, 10.0.11.52'
                            }
                        ]
                    };
                    const localAddresses = ['10.0.1.211'];
                    provider.routeTags = { F5_LABEL: 'foo' };
                    provider.routeAddresses = ['192.0.2.0/24'];
                    provider.routeSelfIpsTag = 'F5_SELF_IPS';
                    const describeNetworkInterfacesResponse = {
                        NetworkInterfaces: [
                            {
                                NetworkInterfaceId: 'eni-345'
                            }
                        ]
                    };
                    provider.ec2.describeNetworkInterfaces = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve(describeNetworkInterfacesResponse);
                            }
                        });
                    provider.ec2.describeRouteTables = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({ RouteTables: [routeTable] });
                            }
                        });
                    provider.ec2.replaceRoute = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({});
                            }
                        });
                    const createRouteSpy = sinon.spy(provider, '_replaceRoute');
                    return provider.updateRoutes({ localAddresses })
                        .then(() => {
                            assert(createRouteSpy.calledOnce);
                            assert(createRouteSpy.calledWith('192.0.2.0/24', 'eni-345', 'rtb-123'));
                        })
                        .catch(err => Promise.reject(err));
                })
                .catch(err => Promise.reject(err));
        });
        it('not update routes if route does not exist', () => {
            provider.init(mockInitData)
                .then(() => {
                    const routeTable = {
                        RouteTableId: 'rtb-123',
                        Routes: [
                            {
                                DestinationCidrBlock: '10.0.0.0/16',
                                GatewayId: 'local',
                                Origin: 'CreateRouteTable',
                                State: 'active'
                            },
                            {
                                DestinationCidrBlock: '0.0.0.0/0',
                                GatewayId: 'igw-123',
                                Origin: 'CreateRoute',
                                State: 'active'
                            }
                        ],
                        Tags: [
                            {
                                Key: 'F5_CLOUD_FAILOVER_LABEL',
                                Value: 'foo'
                            },
                            {
                                Key: 'F5_SELF_IPS',
                                Value: '10.0.1.211, 10.0.11.52'
                            }
                        ]
                    };
                    const localAddresses = ['10.0.2.211'];
                    provider.routeTags = { F5_LABEL: 'foo1' };
                    provider.routeAddresses = ['192.1.2.0/24'];
                    provider.routeSelfIpsTag = 'F5_SELF_IPS';
                    const describeNetworkInterfacesResponse = {
                        NetworkInterfaces: [
                            {
                                NetworkInterfaceId: 'eni-345'
                            }
                        ]
                    };
                    provider.ec2.describeNetworkInterfaces = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve(describeNetworkInterfacesResponse);
                            }
                        });
                    provider.ec2.describeRouteTables = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({ RouteTables: [routeTable] });
                            }
                        });
                    provider.ec2.replaceRoute = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({});
                            }
                        });
                    const createRouteSpy = sinon.spy(provider, '_replaceRoute');
                    return provider.updateRoutes({ localAddresses })
                        .then(() => {
                            assert(createRouteSpy.notCalled);
                        })
                        .catch(err => Promise.reject(err));
                })
                .catch(err => Promise.reject(err));
        });
    });
});
