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


const cloud = 'azure';

describe('Provider - Azure', () => {
    let AzureCloudProvider;
    let f5CloudLibs;
    let provider;

    const mockResourceGroup = 'foo';
    const mockSubscriptionId = 'foo';
    const mockMetadata = {
        compute: {
            resourceGroupName: mockResourceGroup,
            subscriptionId: mockSubscriptionId,
            azEnvironment: 'AzurePublicCloud'
        }
    };

    before(() => {
        AzureCloudProvider = require('../../../src/nodejs/providers/azure/cloud.js').Cloud;
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');
    });
    beforeEach(() => {
        provider = new AzureCloudProvider(mockMetadata);

        provider.logger = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.warning = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.verbose = sinon.stub();
        provider.logger.silly = sinon.stub();
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('validate constructor', () => {
        assert.strictEqual(provider.environment, cloud);
    });

    it('should initialize azure provider', () => {
        sinon.replace(f5CloudLibs.util, 'getDataFromUrl', sinon.fake.resolves(mockMetadata));

        const storageAccounts = [
            {
                name: 'foo',
                tags: {
                    foo: 'bar'
                }
            }
        ];
        provider._listStorageAccounts = sinon.stub().resolves(storageAccounts);
        provider._getStorageAccountKey = sinon.stub().resolves({ name: 'foo', key: 'Zm9v' });
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init()
            .then(() => {
                assert.strictEqual(provider.resourceGroup, mockResourceGroup);
                assert.strictEqual(provider.subscriptionId, mockSubscriptionId);

                assert.strictEqual(provider._getStorageAccountKey.args[0][0], 'foo');
            })
            .catch(err => Promise.reject(err));
    });

    it('should initialize azure provider and throw error about missing storage account', () => {
        sinon.replace(f5CloudLibs.util, 'getDataFromUrl', sinon.fake.resolves(mockMetadata));

        provider._listStorageAccounts = sinon.stub().resolves([]);
        provider._getStorageAccountKey = sinon.stub().resolves({ name: 'foo', key: 'Zm9v' });
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init()
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                if (err.message.indexOf('No storage account found') !== -1) {
                    assert.ok(true);
                } else {
                    assert.fail(err.message);
                }
            });
    });

    it('should _getInstanceMetadata with promise rejection', () => {
        f5CloudLibs.util.getDataFromUrl = sinon.stub().rejects();

        return provider._getInstanceMetadata()
            .then(() => {
                // fails when promise is resolved
                assert.fail();
            })
            .catch(() => {
                // succeeds when error recieved
                assert.ok(true);
            });
    });

    it('validate _listStorageAccounts returns all instances', () => {
        const listResponse = [
            {
                name: 'sa01',
                tags: {
                    foo: 'bar'
                }
            },
            {
                name: 'sa02',
                tags: {}
            }
        ];

        provider.storageClient = sinon.stub();
        provider.storageClient.storageAccounts = sinon.stub();
        provider.storageClient.storageAccounts.list = sinon.stub().resolves(listResponse);

        return provider._listStorageAccounts()
            .then((storageAccounts) => {
                assert.deepStrictEqual(listResponse, storageAccounts);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _listStorageAccounts returns tagged instances', () => {
        const listResponse = [
            {
                name: 'sa01',
                tags: {
                    foo: 'bar'
                }
            },
            {
                name: 'sa02',
                tags: {}
            }
        ];

        provider.storageClient = sinon.stub();
        provider.storageClient.storageAccounts = sinon.stub();
        provider.storageClient.storageAccounts.list = sinon.stub().resolves(listResponse);

        return provider._listStorageAccounts({ tags: { foo: 'bar' } })
            .then((storageAccounts) => {
                assert.deepStrictEqual([listResponse[0]], storageAccounts);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _getStorageAccountKey returns first key', () => {
        const listKeysResponse = {
            keys: [
                {
                    value: 'foo'
                }
            ]
        };

        provider.storageClient = sinon.stub();
        provider.storageClient.storageAccounts = sinon.stub();
        provider.storageClient.storageAccounts.listKeys = sinon.stub().resolves(listKeysResponse);

        return provider._getStorageAccountKey('mysa')
            .then((keyInfo) => {
                assert.deepStrictEqual({ name: 'mysa', key: 'foo' }, keyInfo);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _initStorageAccountContainer returns promise', () => {
        provider.storageOperationsClient = sinon.stub();
        provider.storageOperationsClient.createContainerIfNotExists = sinon.stub().yields(null, []);

        return provider._initStorageAccountContainer('mysa')
            .then(() => {
                assert.strictEqual(
                    provider.storageOperationsClient.createContainerIfNotExists.called, true
                );
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _initStorageAccountContainer returns reject promise', () => {
        provider.storageOperationsClient = sinon.stub();
        provider.storageOperationsClient.createContainerIfNotExists = sinon.stub().yields(new Error('error'), []);

        return provider._initStorageAccountContainer('mysa')
            .then(() => {
                assert.fail('error should be thrown');
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('should validate updateAddresses does not throw error if update operations is empty', () => {
        const opts = { updateOperations: { interfaces: {} } };
        return provider.updateAddresses(opts)
            .catch(err => Promise.reject(err));
    });

    it('should validate updateAddresses performs discovery', () => {
        const localAddresses = ['2.2.2.2'];
        const failoverAddresses = ['10.10.10.10'];
        const listNicsResponse = [
            {
                id: 'id_nic01',
                provisioningState: 'Succeeded',
                ipConfigurations: [
                    {
                        privateIPAddress: '1.1.1.1'
                    },
                    {
                        privateIPAddress: '10.10.10.10'
                    }
                ],
                name: 'nic01',
                location: 'location01',
                enableIPForwarding: false,
                networkSecurityGroup: 'nsgNic01',
                tags: {
                    f5_cloud_failover_label: 'tagsNic01',
                    f5_cloud_failover_nic_map: 'external'
                }
            },
            {
                id: 'id_nic02',
                provisioningState: 'Succeeded',
                ipConfigurations: [
                    {
                        privateIPAddress: '2.2.2.2'
                    }
                ],
                name: 'nic02',
                location: 'location02',
                enableIPForwarding: false,
                networkSecurityGroup: 'nsgNic02',
                tags: {
                    f5_cloud_failover_label: 'tagsNic02',
                    f5_cloud_failover_nic_map: 'external'
                }
            }
        ];
        sinon.replace(provider, '_listNics', sinon.fake.resolves(listNicsResponse));
        const updateAddressesSpy = sinon.stub(provider, '_updateAddresses').resolves();

        return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
            .then(operations => provider.updateAddresses({ updateOperations: operations }))
            .then(() => {
                const disassociateArgs = updateAddressesSpy.getCall(0).args[0][0];
                assert.strictEqual(disassociateArgs[1], 'nic01');
                assert.deepStrictEqual(disassociateArgs[2].ipConfigurations[0].privateIPAddress, '1.1.1.1');

                const associateArgs = updateAddressesSpy.getCall(0).args[1][0];
                assert.strictEqual(associateArgs[1], 'nic02');
                assert.deepStrictEqual(associateArgs[2].ipConfigurations[0].privateIPAddress, '2.2.2.2');
                assert.deepStrictEqual(associateArgs[2].ipConfigurations[1].privateIPAddress, '10.10.10.10');
            })
            .catch(err => Promise.reject(err));
    });
    it('should validate updateAddresses doen\'t perform discovery due to mismatched nic tags', () => {
        const localAddresses = ['2.2.2.2'];
        const failoverAddresses = ['10.10.10.10'];
        const listNicsResponse = [
            {
                id: 'id_nic01',
                provisioningState: 'Succeeded',
                ipConfigurations: [
                    {
                        privateIPAddress: '1.1.1.1'
                    },
                    {
                        privateIPAddress: '10.10.10.10'
                    }
                ],
                name: 'nic01',
                location: 'location01',
                enableIPForwarding: false,
                networkSecurityGroup: 'nsgNic01',
                tags: {
                    f5_cloud_failover_label: 'tagsNic01',
                    f5_cloud_failover_nic_map: 'external'
                }
            },
            {
                id: 'id_nic02',
                provisioningState: 'Succeeded',
                ipConfigurations: [
                    {
                        privateIPAddress: '2.2.2.2'
                    }
                ],
                name: 'nic02',
                location: 'location02',
                enableIPForwarding: false,
                networkSecurityGroup: 'nsgNic02',
                tags: {
                    f5_cloud_failover_label: 'tagsNic02',
                    f5_cloud_failover_nic_map: 'externalfoo'
                }
            }
        ];
        sinon.replace(provider, '_listNics', sinon.fake.resolves(listNicsResponse));
        const updateAddressesSpy = sinon.stub(provider, '_updateAddresses').resolves();

        return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
            .then(operations => provider.updateAddresses({ updateOperations: operations }))
            .then(() => {
                const disassociateArgs = updateAddressesSpy.getCall(0).args[0][0];
                assert.strictEqual(disassociateArgs, undefined);

                const associateArgs = updateAddressesSpy.getCall(0).args[1][0];
                assert.strictEqual(associateArgs, undefined);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _updateNic promise callback for valid case', () => {
        provider.networkClient = sinon.stub();
        provider.networkClient.networkInterfaces = sinon.stub();
        provider.networkClient.networkInterfaces.createOrUpdate = sinon.stub()
            .callsFake((group, nicName, nicParams, callback) => {
                assert.strictEqual(callback(false, 'some_data'), 'some_data');
                return Promise.resolve();
            });


        const nicParams = {
            enableIPForwarding: true,
            ipConfigurations: [],
            location: 'location02',
            networkSecurityGroup: 'nsgNic01',
            tags: 'tagsNic01'
        };

        return provider._updateNic('resourceGroup01', 'nic01', nicParams, 'Dissasociate')
            .then((updateNicsResponse) => {
                assert.strictEqual(updateNicsResponse, 'some_data');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _updateNic promise rejection', () => {
        provider.networkClient = sinon.stub();
        provider.networkClient.networkInterfaces = sinon.stub();
        provider.networkClient.networkInterfaces.createOrUpdate = sinon.stub()
            .callsFake((group, nicName, nicParams, callback) => {
                assert.strictEqual(callback(true, 'some_data'), 'some_data');
                return Promise.resolve();
            });


        const nicParams = {
            enableIPForwarding: true,
            ipConfigurations: [],
            location: 'location02',
            networkSecurityGroup: 'nsgNic01',
            tags: 'tagsNic01'
        };

        return provider._updateNic('resourceGroup01', 'nic01', nicParams, 'Dissasociate')
            .then(() => {
                // fails when promise gets resolved
                assert.fail();
            })
            .catch(() => {
                // succeeds when promise is rejected
                assert.ok(true);
            });
    });

    it('validate _updateAddresses method with empty parameters', () => {
        const firstValue = false;
        const secondValue = false;

        return provider._updateAddresses(firstValue, secondValue)
            .then(() => {
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _updateAddresses method with valid parameters', () => {
        const disassociate = [['resourceGroup01', 'nic01',
            {
                enableIPForwarding: true,
                ipConfigurations: [],
                location: 'location02',
                networkSecurityGroup: 'nsgNic01',
                tags: 'tagsNic01'
            },
            'Disassociate'
        ]
        ];
        const associate = [['resourceGroup01', 'nic02',
            {
                enableIPForwarding: true,
                ipConfigurations: [
                    {
                        privateIPAddress: '2.2.2.2'
                    }
                ],
                location: 'location02',
                networkSecurityGroup: 'nsgNic02',
                tags: 'tagsNic02'
            },
            'Associate'
        ]
        ];
        sinon.stub(provider, '_updateNic').resolves();

        return provider._updateAddresses(disassociate, associate)
            .then(() => {
                // suceeds when promise gets resolved
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _listNics with resolved promise', () => {
        const options = {
            tags: { tag01: 'value01' }
        };

        const nic01 = {
            id: 'id_nic01',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '1.1.1.1'
                }
            ],
            name: 'nic01',
            location: 'location01',
            enableIPForwarding: false,
            networkSecurityGroup: 'nsgNic01',
            tags: {
                tag01: 'value01',
                tag02: 'value02'
            }
        };
        const nic02 = {
            id: 'id_nic02',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '2.2.2.2'
                }
            ],
            name: 'nic02',
            location: 'location02',
            enableIPForwarding: false,
            networkSecurityGroup: 'nsgNic02',
            tags: {
                tag01: 'value01',
                tag02: 'value02'
            }
        };

        provider.networkClient = sinon.stub();
        provider.networkClient.networkInterfaces = sinon.stub();
        provider.networkClient.networkInterfaces.list = sinon.stub((error, callback) => {
            callback(error, [nic01, nic02]);
        });

        return provider._listNics(options)
            .then((response) => {
                // validating first nic data
                assert.strictEqual(response[0].id, 'id_nic01');
                assert.strictEqual(response[0].location, 'location01');
                assert.strictEqual(response[0].networkSecurityGroup, 'nsgNic01');

                // validating second nic data
                assert.strictEqual(response[1].id, 'id_nic02');
                assert.strictEqual(response[1].location, 'location02');
                assert.strictEqual(response[1].networkSecurityGroup, 'nsgNic02');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _listNics returns empty array when no tags exist', () => {
        const options = {
            tags: { tag01: 'value01' }
        };

        const nic01 = {
            id: 'id_nic01',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '1.1.1.1'
                }
            ],
            name: 'nic01',
            location: 'location01',
            enableIPForwarding: false,
            networkSecurityGroup: 'nsgNic01'
        };

        provider.networkClient = sinon.stub();
        provider.networkClient.networkInterfaces = sinon.stub();
        provider.networkClient.networkInterfaces.list = sinon.stub((error, callback) => {
            callback(error, [nic01]);
        });

        return provider._listNics(options)
            .then((response) => {
                assert.deepStrictEqual(response, []);
            })
            .catch(err => Promise.reject(err));
    });


    it('validate _listNics rejection', () => {
        const options = {
            tags: { tag01: 'value01' }
        };

        provider.networkClient = sinon.stub();
        provider.networkClient.networkInterfaces = sinon.stub();
        provider.networkClient.networkInterfaces.list = sinon.stub((error, callback) => {
            callback(true, []);
        });

        return provider._listNics(options)
            .then(() => {
                // fails when promise gets resolved
                assert.fail();
            })
            .catch(() => {
                // succeeds when rejection recieved
                assert.ok(true);
            });
    });

    describe('function updateRoutes should', () => {
        const localAddresses = ['10.0.1.11', '10.0.1.13'];

        let providerRouteUpdateSpy;

        beforeEach(() => {
            const routeTable01 = {
                id: '/foo/foo/foo/rg01/id_rt01',
                name: 'rt01',
                provisioningState: 'Succeeded',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11'
                },
                routes: [
                    {
                        id: 'id_route01',
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.10'
                    }]
            };
            const routeTable02 = {
                id: '/foo/foo/foo/rg01/id_rt02',
                name: 'rt02',
                provisioningState: 'Succeeded',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                },
                routes: [
                    {
                        id: 'id_route02',
                        name: 'route02',
                        addressPrefix: '192.0.0.1/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.12'
                    }]
            };

            provider.networkClient = sinon.stub();
            provider.networkClient.routeTables = sinon.stub();
            provider.networkClient.routeTables.listAll = sinon.stub().yields(null, [routeTable01, routeTable02]);
            provider.networkClient.routes = sinon.stub();

            providerRouteUpdateSpy = sinon.stub().yields(null, []);
            provider.networkClient.routes.beginCreateOrUpdate = providerRouteUpdateSpy;

            provider.routeTags = { F5_LABEL: 'foo' };
            provider.routeAddressRanges = [{
                routeAddresses: ['192.0.0.0/24'],
                routeNextHopAddresses: {
                    type: 'routeTag',
                    tag: 'F5_SELF_IPS'
                }
            }];
        });

        it('not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateRoutes(opts)
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: routeTag', () => provider.updateRoutes({ localAddresses, discoverOnly: true })
            .then(operations => provider.updateRoutes({ updateOperations: operations }))
            .then(() => {
                assert.strictEqual(providerRouteUpdateSpy.args[0][3].nextHopIpAddress, '10.0.1.11');
            })
            .catch(err => Promise.reject(err)));

        it('update routes using next hop discovery method: static', () => {
            provider.routeAddressRanges[0].routeNextHopAddresses = {
                type: 'static',
                items: ['10.0.1.10', '10.0.1.11']
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then(operations => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.strictEqual(providerRouteUpdateSpy.args[0][3].nextHopIpAddress, '10.0.1.11');
                })
                .catch(err => Promise.reject(err));
        });

        it('update multiple routes using next hop discovery method: static', () => {
            provider.routeAddressRanges = [
                {
                    routeAddresses: ['192.0.0.0/24'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['10.0.1.10', '10.0.1.11']
                    }
                },
                {
                    routeAddresses: ['192.0.0.1/24'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['10.0.1.10', '10.0.1.11']
                    }
                }];

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then(operations => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.strictEqual(providerRouteUpdateSpy.args[0][3].nextHopIpAddress, '10.0.1.11');
                    assert.strictEqual(providerRouteUpdateSpy.args[1][3].nextHopIpAddress, '10.0.1.11');
                })
                .catch(err => Promise.reject(err));
        });

        it('not update routes when matching next hop address is not found', () => {
            provider.routeAddressRanges[0].routeNextHopAddresses = {
                type: 'static',
                items: []
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then(operations => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.strictEqual(providerRouteUpdateSpy.called, false);
                })
                .catch(err => Promise.reject(err));
        });
    });

    it('should execute downloadDataFromStorage', () => {
        provider.storageOperationsClient = sinon.stub();
        const doesBlobExistSpy = sinon.stub().yields(null, { exists: true });
        provider.storageOperationsClient.doesBlobExist = doesBlobExistSpy;
        const getBlobToTextSpy = sinon.stub().yields(null, JSON.stringify({ foo: 'bar' }));
        provider.storageOperationsClient.getBlobToText = getBlobToTextSpy;

        return provider.downloadDataFromStorage('myfile')
            .then((data) => {
                assert.strictEqual(data.foo, 'bar');
            })
            .catch(err => Promise.reject(err));
    });

    it('should execute downloadDataFromStorage and return empty object if file does not exist', () => {
        provider.storageOperationsClient = sinon.stub();
        provider.storageOperationsClient.doesBlobExist = sinon.stub().yields(null, { exists: false });

        return provider.downloadDataFromStorage('myfile')
            .then((data) => {
                assert.deepStrictEqual(data, {});
            })
            .catch(err => Promise.reject(err));
    });

    it('should execute uploadDataToStorage', () => {
        provider.storageOperationsClient = sinon.stub();
        const createBlockBlobFromTextSpy = sinon.stub().yields(null);
        provider.storageOperationsClient.createBlockBlobFromText = createBlockBlobFromTextSpy;

        return provider.uploadDataToStorage('myfile', {})
            .then(() => {
                assert.strictEqual(createBlockBlobFromTextSpy.args[0][1], 'myfile');
                assert.strictEqual(createBlockBlobFromTextSpy.args[0][2], '{}');
            })
            .catch(err => Promise.reject(err));
    });

    describe('function getAssociatedAddressAndRouteInfo', () => {
        it('should return addresses and routes for active device ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [
                    {
                        privateIpAddress: '1.1.1.1',
                        publicIpAddress: '100.100.100.100',
                        networkInterfaceId: null
                    }
                ],
                routes: [
                    {
                        routeTableId: '/foo/foo/foo/rg01/id_rt01',
                        routeTableName: 'rt01',
                        networkId: '/foo/foo/foo/rg01/subnets/internal'
                    }
                ]
            };
            const mockInstanceMetadata = {
                compute: {
                    vmId: 'vm-1'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        macAddress: '000000070FD1'
                    }]
                }


            };
            const routeTable01 = {
                id: '/foo/foo/foo/rg01/id_rt01',
                name: 'rt01',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '1.1.1.1, 2.2.2.2'
                },
                routes: [
                    {
                        id: 'id_route01',
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '1.1.1.1'
                    }
                ],
                subnets: [
                    {
                        id: '/foo/foo/foo/rg01/subnets/internal'
                    }
                ]

            };
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadata);
            provider._getRouteTables = sinon.stub().resolves([routeTable01]);
            provider.routeAddressRanges = [{
                routeAddresses: ['192.0.0.0/24'],
                routeNextHopAddresses: {
                    type: 'routeTag',
                    tag: 'F5_SELF_IPS'
                }
            }];
            return provider.getAssociatedAddressAndRouteInfo()
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch(err => Promise.reject(err));
        });

        it('should return addresses and not routes for standby device ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [
                    {
                        privateIpAddress: '1.1.1.1',
                        publicIpAddress: '100.100.100.100',
                        networkInterfaceId: null
                    }
                ],
                routes: []
            };
            const mockInstanceMetadataStandby = {
                compute: {
                    vmId: 'vm-1'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        macAddress: '000000070FD1'
                    }]
                }
            };
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadataStandby);
            provider._getRouteTables = sinon.stub().resolves([]);
            provider.routeNextHopAddresses = {
                type: 'routeTag',
                tag: 'F5_SELF_IPS'
            };

            return provider.getAssociatedAddressAndRouteInfo()
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch(err => Promise.reject(err));
        });
    });
});
