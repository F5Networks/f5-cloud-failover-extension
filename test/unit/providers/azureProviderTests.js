/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');
const sinon = require('sinon');

const cloud = 'azure';

describe('Provider - Azure', () => {
    let AzureCloudProvider;
    let f5CloudLibs;
    let provider;

    const mockResourceGroup = 'foo';
    const mockSubscriptionId = 'xxxx';
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

        provider.maxRetries = 0;
        provider.retryInterval = 100;
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
                assert.strictEqual(provider.primarySubscriptionId, mockSubscriptionId);

                assert.strictEqual(provider._getStorageAccountKey.args[0][0], 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should initialize azure provider with custom enviroments', () => {
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
        return provider.init({
            customEnvironment: {
                name: 'CustomAzureSettings',
                portalUrl: 'https://portal.azure.com',
                publishingProfileUrl: 'http://go.microsoft.com/fwlink/?LinkId=254432',
                managementEndpointUrl: 'https://management.core.windows.net',
                resourceManagerEndpointUrl: 'https://management.azure.com/',
                sqlManagementEndpointUrl: 'https://management.core.windows.net:8443/',
                sqlServerHostnameSuffix: '.database.windows.net',
                galleryEndpointUrl: 'https://gallery.azure.com/',
                activeDirectoryEndpointUrl: 'https://login.microsoftonline.com/',
                activeDirectoryResourceId: 'https://management.core.windows.net/',
                activeDirectoryGraphResourceId: 'https://graph.windows.net/',
                batchResourceId: 'https://batch.core.windows.net/',
                activeDirectoryGraphApiVersion: '2013-04-05',
                storageEndpointSuffix: '.core.windows.net',
                keyVaultDnsSuffix: '.vault.azure.net',
                azureDataLakeStoreFileSystemEndpointSuffix: 'azuredatalakestore.net',
                azureDataLakeAnalyticsCatalogAndJobEndpointSuffix: 'azuredatalakeanalytics.net'
            }
        })
            .then(() => {
                assert.strictEqual(provider.resourceGroup, mockResourceGroup);
                assert.strictEqual(provider.primarySubscriptionId, mockSubscriptionId);
                assert.strictEqual(provider.customEnvironment.name, 'CustomAzureSettings');
                assert.strictEqual(provider._getStorageAccountKey.args[0][0], 'foo');
            })
            .catch((err) => Promise.reject(err));
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

    it('validate if storageName is set and storageTags are not then return _discoverStorageAccount', () => {
        sinon.replace(f5CloudLibs.util, 'getDataFromUrl', sinon.fake.resolves(mockMetadata));

        const listStorageAccountsSpy = sinon.spy(provider, '_listStorageAccounts');
        provider._getStorageAccountKey = sinon.stub().resolves({ name: 'foo', key: 'Zm9v' });
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init({ storageName: 'foo' })
            .then(() => {
                assert.strictEqual(listStorageAccountsSpy.called, false);
                assert.strictEqual(provider._getStorageAccountKey.args[0][0], 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate if storageTags are set and storageName is not then return _listStorageAccounts', () => {
        sinon.replace(f5CloudLibs.util, 'getDataFromUrl', sinon.fake.resolves(mockMetadata));

        const storageAccountResponse = [
            {
                name: 'foo'
            }
        ];

        provider._listStorageAccounts = sinon.stub().resolves(storageAccountResponse);
        provider._getStorageAccountKey = sinon.stub().resolves({ name: 'foo', key: 'Zm9v' });
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init({ tags: { foo: 'bar' } })
            .then(() => {
                assert.strictEqual(provider._listStorageAccounts.called, true);
                assert.strictEqual(provider._getStorageAccountKey.args[0][0], 'foo');
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
                        privateIPAddress: '10.10.10.10',
                        subnet: {
                            id: 'my-subnet-resource-location'
                        },
                        primary: false,
                        publicIPAddress: {
                            id: 'vip-pip1'
                        }
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

        return provider.discoverAddresses({ localAddresses, failoverAddresses })
            .then((operations) => provider.updateAddresses({ updateOperations: operations.interfaces }))
            .then(() => {
                const disassociateArgs = updateAddressesSpy.getCall(0).args[0].disassociate;
                assert.strictEqual(disassociateArgs[0][1], 'nic01');
                assert.deepStrictEqual(disassociateArgs[0][2].ipConfigurations[0].privateIPAddress, '1.1.1.1');

                const associateArgs = updateAddressesSpy.getCall(0).args[0].associate;
                assert.strictEqual(associateArgs[0][1], 'nic02');
                assert.deepStrictEqual(associateArgs[0][2].ipConfigurations[0].privateIPAddress, '2.2.2.2');
                assert.deepStrictEqual(associateArgs[0][2].ipConfigurations[1].privateIPAddress, '10.10.10.10');
                assert.deepStrictEqual(associateArgs[0][2].ipConfigurations[1].subnet.id, 'my-subnet-resource-location');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should validate updateAddresses does not perform discovery due to mismatched nic tags', () => {
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

        return provider.discoverAddresses({ localAddresses, failoverAddresses })
            .then((operations) => provider.updateAddresses({ updateOperations: operations.interfaces }))
            .then(() => {
                const disassociateArgs = updateAddressesSpy.getCall(0).args[0][0];
                assert.strictEqual(disassociateArgs, undefined);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _updateNic promise callback for valid case', () => {
        provider.primarySubscriptionId = mockSubscriptionId;
        provider.networkClients[mockSubscriptionId] = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces.beginCreateOrUpdate = sinon.stub()
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
            .catch((err) => Promise.reject(err));
    });

    it('validate _updateNic promise rejection', () => {
        provider.primarySubscriptionId = mockSubscriptionId;
        provider.networkClients[mockSubscriptionId] = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces.beginCreateOrUpdate = sinon.stub()
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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

        provider.primarySubscriptionId = mockSubscriptionId;
        provider.networkClients[mockSubscriptionId] = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces.list = sinon.stub((error, callback) => {
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
            .catch((err) => Promise.reject(err));
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

        provider.primarySubscriptionId = mockSubscriptionId;
        provider.networkClients[mockSubscriptionId] = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces.list = sinon.stub((error, callback) => {
            callback(error, [nic01]);
        });

        return provider._listNics(options)
            .then((response) => {
                assert.deepStrictEqual(response, []);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _listNics rejection', () => {
        const options = {
            tags: { tag01: 'value01' }
        };

        provider.primarySubscriptionId = mockSubscriptionId;
        provider.networkClients[mockSubscriptionId] = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
        provider.networkClients[mockSubscriptionId].networkInterfaces.list = sinon.stub((error, callback) => {
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
        const secondarySubscriptionId = 'yyyy';
        const localAddresses = ['10.0.1.11', '10.0.1.13', 'ace:cab:deca:deee::5'];
        const routeTablesBySubscription = {
            [mockSubscriptionId]: [
                {
                    id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                    name: 'rt01',
                    provisioningState: 'Succeeded',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                    },
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            addressPrefix: '192.0.0.0/24',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: '10.0.1.10',
                            provisioningState: 'Succeeded',
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            addressPrefix: 'ace:cab:deca:defe::/64',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: 'ace:cab:deca:deee::4',
                            provisioningState: 'Succeeded',
                            etag: 'foo'
                        }
                    ]
                },
                {
                    id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt02`,
                    name: 'rt02',
                    provisioningState: 'Succeeded',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                    },
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route02`,
                            name: 'route02',
                            addressPrefix: '192.0.1.0/24',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: '10.0.1.12',
                            provisioningState: 'Succeeded',
                            etag: 'foo'
                        }]
                }
            ],
            [secondarySubscriptionId]: [
                {
                    id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/rt03`,
                    name: 'rt03',
                    provisioningState: 'Succeeded',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                    },
                    routes: [
                        {
                            id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/route01`,
                            name: 'route01',
                            addressPrefix: '192.0.10.0/24',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: '10.0.1.12'
                        }
                    ]
                }
            ]
        };

        beforeEach(() => {
            provider._getInstanceMetadata = sinon.stub().resolves(mockMetadata);
            provider._getRouteTableByName = sinon.stub().resolves();
            provider._listStorageAccounts = sinon.stub().resolves([
                {
                    name: 'foo',
                    tags: {
                        foo: 'bar'
                    }
                }
            ]);
            provider._getStorageAccountKey = sinon.stub().resolves({ name: 'foo', key: 'Zm9v' });
            provider._initStorageAccountContainer = sinon.stub().resolves();

            return provider.init({
                routeGroupDefinitions: [
                    {
                        routeTags: { F5_LABEL: 'foo' },
                        routeAddressRanges: [
                            {
                                routeAddresses: ['192.0.0.0/24'],
                                routeNextHopAddresses: {
                                    type: 'routeTag',
                                    tag: 'F5_SELF_IPS'
                                }
                            }
                        ]
                    }
                ],
                subscriptions: [secondarySubscriptionId]
            })
                .then(() => {
                    Object.keys(provider.networkClients).forEach((key) => {
                        provider.networkClients[key] = sinon.stub();
                        provider.networkClients[key].routeTables = sinon.stub();
                        provider.networkClients[key].routeTables.listAll = sinon.stub().yields(
                            null, JSON.parse(JSON.stringify(routeTablesBySubscription[key]))
                        );
                        provider.networkClients[key].routes = sinon.stub();
                        provider.networkClients[key].routeTables.beginCreateOrUpdate = sinon.stub().yields(
                            null, []
                        );
                    });
                })
                .catch((err) => Promise.reject(err));
        });

        it('not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateRoutes(opts)
                .catch((err) => Promise.reject(err));
        });

        it('update routes using next hop discovery method: routeTag', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                provisioningState: 'Succeeded',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                routes: [
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.10',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    },
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                        name: 'route03',
                        addressPrefix: 'ace:cab:deca:defe::/64',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: 'ace:cab:deca:deee::4',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    }
                ]
            });

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    const routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[0].nextHopIpAddress, '10.0.1.11');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update multiple routes using next hop discovery method: static', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                provisioningState: 'Succeeded',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                routes: [
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.10',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    },
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                        name: 'route03',
                        addressPrefix: 'ace:cab:deca:defe::/64',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: 'ace:cab:deca:deee::4',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    }
                ]
            });
            provider.routeGroupDefinitions[0].routeAddressRanges.push({
                routeAddresses: ['192.0.1.0/24'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: ['10.0.1.10', '10.0.1.11']
                }
            });

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    const routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[0].nextHopIpAddress, '10.0.1.11');
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[1].nextHopIpAddress, 'ace:cab:deca:deee::4');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update IPv6 routes using next hop discovery method: static', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                provisioningState: 'Succeeded',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                routes: [
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.10',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    },
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                        name: 'route03',
                        addressPrefix: 'ace:cab:deca:defe::/64',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: 'ace:cab:deca:deee::4',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    }
                ]
            });
            provider.routeGroupDefinitions[0].routeAddressRanges.push({
                routeAddresses: ['ace:cab:deca:defe::/64'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: ['ace:cab:deca:deee::4', 'ace:cab:deca:deee::5']
                }
            });

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    const routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[1].nextHopIpAddress, 'ace:cab:deca:deee::5');
                })
                .catch((err) => Promise.reject(err));
        });

        it('not update routes when matching next hop address is not found', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses = {
                type: 'static',
                items: []
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    const routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.called, false);
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes across multiple subscriptions', () => {
            sinon.stub(provider, '_getRouteTableConfig')
                .onFirstCall().resolves({
                    id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                    name: 'rt01',
                    provisioningState: 'Succeeded',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                    },
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            addressPrefix: '192.0.0.0/24',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: '10.0.1.10',
                            provisioningState: 'Succeeded',
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            addressPrefix: 'ace:cab:deca:defe::/64',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: 'ace:cab:deca:deee::4',
                            provisioningState: 'Succeeded',
                            etag: 'foo'
                        }
                    ]
                })
                .onSecondCall()
                .resolves({
                    id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/rt03`,
                    name: 'rt03',
                    provisioningState: 'Succeeded',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                    },
                    routes: [
                        {
                            id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/route01`,
                            name: 'route01',
                            addressPrefix: '192.0.10.0/24',
                            nextHopType: 'VirtualAppliance',
                            nextHopIpAddress: '10.0.1.12',
                            provisioningState: 'Succeeded',
                            etag: 'foo'
                        }
                    ]
                });

            provider.routeGroupDefinitions[0].routeAddressRanges.push({
                routeAddresses: ['192.0.10.0/24'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: ['10.0.1.10', '10.0.1.11']
                }
            });

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    let routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[0].nextHopIpAddress, '10.0.1.11');

                    routeUpdateSpy = provider.networkClients[secondarySubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[0].nextHopIpAddress, '10.0.1.11');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using multiple route group definitions', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                provisioningState: 'Succeeded',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                routes: [
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.10',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    },
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                        name: 'route03',
                        addressPrefix: 'ace:cab:deca:defe::/64',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: 'ace:cab:deca:deee::4',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    }
                ]
            });
            provider.routeGroupDefinitions = [
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['10.0.1.10', '10.0.1.11']
                            }
                        }
                    ]
                },
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.1.0/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['10.0.1.10', '10.0.1.11']
                            }
                        }
                    ]
                },
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['ace:cab:deca:defe::/64'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['ace:cab:deca:deee::4', 'ace:cab:deca:deee::5']
                            }
                        }
                    ]
                }
            ];

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    const routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[0].nextHopIpAddress, '10.0.1.11');
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[1].nextHopIpAddress, 'ace:cab:deca:deee::5');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using route name', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                provisioningState: 'Succeeded',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                routes: [
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '10.0.1.10',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    },
                    {
                        id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                        name: 'route03',
                        addressPrefix: 'ace:cab:deca:defe::/64',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: 'ace:cab:deca:deee::4',
                        provisioningState: 'Succeeded',
                        etag: 'foo'
                    }
                ]
            });
            provider.routeGroupDefinitions = [
                {
                    routeName: 'rt01',
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['10.0.1.10', '10.0.1.11']
                            }
                        }
                    ]
                }
            ];

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    const routeUpdateSpy = provider.networkClients[mockSubscriptionId].routeTables.beginCreateOrUpdate;
                    assert.strictEqual(routeUpdateSpy.args[0][2].routes[0].nextHopIpAddress, '10.0.1.11');
                })
                .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
    });

    it('should execute downloadDataFromStorage and return empty object if file does not exist', () => {
        provider.storageOperationsClient = sinon.stub();
        provider.storageOperationsClient.doesBlobExist = sinon.stub().yields(null, { exists: false });

        return provider.downloadDataFromStorage('myfile')
            .then((data) => {
                assert.deepStrictEqual(data, {});
            })
            .catch((err) => Promise.reject(err));
    });

    it('should execute downloadDataFromStorage and retry upon failure', () => {
        provider.storageOperationsClient = sinon.stub();
        const retrierSpy = sinon.spy(provider, '_retrier');
        const downloadDataFromStorageSpy = sinon.spy(provider, 'downloadDataFromStorage');

        return provider.downloadDataFromStorage('myfile', { maxRetries: 1, retryInterval: 1 })
            .catch(() => {
                assert.strictEqual(retrierSpy.calledOnce, true);
                assert.strictEqual(downloadDataFromStorageSpy.calledOnce, true);
                provider.storageOperationsClient.doesBlobExist = sinon.stub().yields(null, { exists: false });
                return provider.downloadDataFromStorage('myfile', { maxRetries: 1, retryInterval: 1 });
            })
            .then((data) => {
                assert.deepStrictEqual(data, {});
                assert.strictEqual(downloadDataFromStorageSpy.calledTwice, true);
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
    });

    it('should execute uploadDataToStorage and retry upon failure', () => {
        provider.storageOperationsClient = sinon.stub();
        const createBlockBlobFromTextSpy = sinon.stub().yields(null);
        const retrierSpy = sinon.spy(provider, '_retrier');
        const uploadDataToStorageSpy = sinon.spy(provider, 'uploadDataToStorage');

        return provider.uploadDataToStorage('myfile', {}, { maxRetries: 1, retryInterval: 1 })
            .catch(() => {
                assert.strictEqual(retrierSpy.calledOnce, true);
                assert.strictEqual(uploadDataToStorageSpy.calledOnce, true);
                provider.storageOperationsClient.createBlockBlobFromText = createBlockBlobFromTextSpy;
                return provider.uploadDataToStorage('myfile', {}, { maxRetries: 1, retryInterval: 1 });
            })
            .then(() => {
                assert.strictEqual(createBlockBlobFromTextSpy.args[0][1], 'myfile');
                assert.strictEqual(createBlockBlobFromTextSpy.args[0][2], '{}');
                assert.strictEqual(uploadDataToStorageSpy.calledTwice, true);
            })
            .catch((err) => Promise.reject(err));
    });

    describe('function getAssociatedAddressAndRouteInfo', () => {
        it('should return addresses and routes for active device ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [
                    {
                        privateIpAddress: '1.1.1.1',
                        publicIpAddress: '100.100.100.100',
                        networkInterfaceId: '/some-path/nic/id'
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
                    vmId: 'vm-1',
                    name: 'test-vm'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        ipv6: {
                            ipAddress: []
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
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    virtualMachine: { id: 'test-vm' },
                    ipConfigurations: [
                        {
                            privateIPAddress: '1.1.1.1',
                            publicIPAddress: {
                                id: '/some-path/public-ip-name'
                            }
                        }
                    ]
                }
            ];
            const mockPublicIpData = {
                id: '/some-path/public-ip-name',
                ipAddress: '100.100.100.100'
            };
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadata);
            provider._listNics = sinon.stub().resolves(mockNicData);
            provider._getPublicIpAddress = sinon.stub().resolves(mockPublicIpData);
            provider._getRouteTables = sinon.stub().resolves([routeTable01]);
            provider.routeGroupDefinitions = [
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'routeTag',
                                tag: 'F5_SELF_IPS'
                            }
                        }
                    ]
                }
            ];

            return provider.getAssociatedAddressAndRouteInfo(true, true)
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should skip routes for active device ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [
                    {
                        privateIpAddress: '1.1.1.1',
                        publicIpAddress: '100.100.100.100',
                        networkInterfaceId: '/some-path/nic/id'
                    }
                ],
                routes: []
            };
            const mockInstanceMetadata = {
                compute: {
                    vmId: 'vm-1',
                    name: 'test-vm'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        ipv6: {
                            ipAddress: []
                        },
                        macAddress: '000000070FD1'
                    }]
                }

            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    virtualMachine: { id: 'test-vm' },
                    ipConfigurations: [
                        {
                            privateIPAddress: '1.1.1.1',
                            publicIPAddress: {
                                id: '/some-path/public-ip-name'
                            }
                        }
                    ]
                }
            ];
            const mockPublicIpData = {
                id: '/some-path/public-ip-name',
                ipAddress: '100.100.100.100'
            };
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadata);
            provider._listNics = sinon.stub().resolves(mockNicData);
            provider._getPublicIpAddress = sinon.stub().resolves(mockPublicIpData);
            provider.routeGroupDefinitions = [
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'routeTag',
                                tag: 'F5_SELF_IPS'
                            }
                        }
                    ]
                }
            ];

            return provider.getAssociatedAddressAndRouteInfo(true, false)
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should skip addresses for active device ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [],
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
                    vmId: 'vm-1',
                    name: 'test-vm'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        ipv6: {
                            ipAddress: []
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
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    virtualMachine: { id: 'test-vm' },
                    ipConfigurations: [
                        {
                            privateIPAddress: '1.1.1.1',
                            publicIPAddress: {
                                id: '/some-path/public-ip-name'
                            }
                        }
                    ]
                }
            ];
            const mockPublicIpData = {
                id: '/some-path/public-ip-name',
                ipAddress: '100.100.100.100'
            };
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadata);
            provider._listNics = sinon.stub().resolves(mockNicData);
            provider._getPublicIpAddress = sinon.stub().resolves(mockPublicIpData);
            provider._getRouteTables = sinon.stub().resolves([routeTable01]);
            provider.routeGroupDefinitions = [
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'routeTag',
                                tag: 'F5_SELF_IPS'
                            }
                        }
                    ]
                }
            ];

            return provider.getAssociatedAddressAndRouteInfo(false, true)
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should return addresses and routes for active device (IPv6) ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [
                    {
                        privateIpAddress: '1.1.1.1',
                        publicIpAddress: '100.100.100.100',
                        networkInterfaceId: '/some-path/nic/id'
                    },
                    {
                        privateIpAddress: 'ace:cab:deca:deee::4',
                        networkInterfaceId: '/some-path/nic/another-id',
                        publicIpAddress: '100.100.100.100'
                    }
                ],
                routes: [
                    {
                        routeTableId: '/foo/foo/foo/rg01/id_rt01',
                        routeTableName: 'rt01',
                        networkId: '/foo/foo/foo/rg01/subnets/internal'
                    },
                    {
                        routeTableId: '/foo/foo/foo/rg01/id_rt01',
                        routeTableName: 'rt01',
                        networkId: '/foo/foo/foo/rg01/subnets/internal'
                    }
                ]
            };
            const mockInstanceMetadata = {
                compute: {
                    vmId: 'vm-1',
                    name: 'test-vm'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        ipv6: {
                            ipAddress: [{
                                privateIpAddress: 'ace:cab:deca:deee::4'
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
                    F5_SELF_IPS: '1.1.1.1, 2.2.2.2, ace:cab:deca:deee::4, ace:cab:deca:deee::5'
                },
                routes: [
                    {
                        id: 'id_route01',
                        name: 'route01',
                        addressPrefix: '192.0.0.0/24',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: '1.1.1.1'
                    },
                    {
                        id: 'id_route02',
                        name: 'route02',
                        addressPrefix: 'ace:cab:deca:defe::/64',
                        nextHopType: 'VirtualAppliance',
                        nextHopIpAddress: 'ace:cab:deca:deee::4'
                    }
                ],
                subnets: [
                    {
                        id: '/foo/foo/foo/rg01/subnets/internal'
                    }
                ]

            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    virtualMachine: { id: 'test-vm' },
                    ipConfigurations: [
                        {
                            privateIPAddress: '1.1.1.1',
                            publicIPAddress: {
                                id: '/some-path/public-ip-name'
                            }
                        }
                    ]
                },
                {
                    id: '/some-path/nic/another-id',
                    virtualMachine: { id: 'test-vm' },
                    ipConfigurations: [
                        {
                            privateIPAddress: 'ace:cab:deca:deee::4',
                            publicIPAddress: {
                                id: '/some-path/public-ip-name'
                            }
                        }
                    ]
                }
            ];
            const mockPublicIpData = {
                id: '/some-path/public-ip-name',
                ipAddress: '100.100.100.100'
            };
            provider._listNics = sinon.stub().resolves(mockNicData);
            provider._getPublicIpAddress = sinon.stub().resolves(mockPublicIpData);
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadata);
            provider._getRouteTables = sinon.stub().resolves([routeTable01]);
            provider.routeGroupDefinitions = [
                {
                    routeTags: { F5_LABEL: 'foo' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24', 'ace:cab:deca:defe::/64'],
                            routeNextHopAddresses: {
                                type: 'routeTag',
                                tag: 'F5_SELF_IPS'
                            }
                        }
                    ]
                }
            ];

            return provider.getAssociatedAddressAndRouteInfo(true, true)
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should return addresses and not routes for standby device ', () => {
            const expectedData = {
                instance: 'vm-1',
                addresses: [
                    {
                        privateIpAddress: '1.1.1.1',
                        publicIpAddress: '100.100.100.100',
                        networkInterfaceId: '/some-path/nic/id'
                    }
                ],
                routes: []
            };
            const mockInstanceMetadataStandby = {
                compute: {
                    vmId: 'vm-1',
                    name: 'test-vm'
                },
                network: {
                    interface: [{
                        ipv4: {
                            ipAddress: [{
                                privateIpAddress: '1.1.1.1',
                                publicIpAddress: '100.100.100.100'
                            }]
                        },
                        ipv6: {
                            ipAddress: []
                        },
                        macAddress: '000000070FD1'
                    }]
                }
            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    virtualMachine: { id: 'test-vm' },
                    ipConfigurations: [
                        {
                            privateIPAddress: '1.1.1.1',
                            publicIPAddress: {
                                id: '/some-path/public-ip-name'
                            }
                        }
                    ]
                }
            ];
            const mockPublicIpData = {
                id: '/some-path/public-ip-name',
                ipAddress: '100.100.100.100'
            };
            provider._listNics = sinon.stub().resolves(mockNicData);
            provider._getPublicIpAddress = sinon.stub().resolves(mockPublicIpData);
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadataStandby);
            provider._getRouteTables = sinon.stub().resolves([]);
            provider.routeGroupDefinitions = [
                {
                    routeNextHopAddresses: {
                        type: 'routeTag',
                        tag: 'F5_SELF_IPS'
                    }
                }];
            return provider.getAssociatedAddressAndRouteInfo(true, true)
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('function _reassociateAddresses', () => {
        const nic01 = {
            id: 'test-nic01',
            name: 'nic01',
            type: 'networkInterfaces',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.10',
                    primary: true
                },
                {
                    privateIPAddress: '10.10.10.100',
                    primary: false
                }
            ]
        };
        const nic02 = {
            id: 'test-nic02',
            name: 'nic02',
            type: 'networkInterfaces',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.20',
                    primary: true
                }
            ]
        };
        const operators = {
            disassociate: [
                [this.resourceGroup, nic01.name, nic01, 'Disassociate']
            ],
            associate: [
                [this.resourceGroup, nic02.name, nic02, 'Associate']
            ]
        };
        it('should reassociate addresses to different NICs via disassociate and then associate', () => {
            sinon.stub(provider, '_updateNic').resolves();
            sinon.stub(provider, '_getNetworkInterfaceByName').resolves();
            return provider._reassociateAddresses(operators)
                .then(() => {
                    // succeeds when promise gets resolved
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('function discoverAddressOperationsUsingDefinitions', () => {
        const options = {};
        const addresses = {
            localAddresses: ['10.10.10.1', '10.10.10.2'],
            failoverAddresses: []
        };
        const addresses2 = {
            localAddresses: ['10.10.10.4', '10.10.11.4'],
            failoverAddresses: []
        };
        // Use nic01 and nic02 to validate across-net,
        // moving publicIPAddress from the secondary ipConfigurations
        const nic01 = {
            id: 'test-nic01',
            name: 'nic01',
            type: 'networkInterfaces',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.1',
                    primary: true,
                    publicIPAddress: {
                        id: 'vip-pip1'
                    },
                    provisioningState: 'Succeeded',
                    subnet: {
                        id: 'foo'
                    }
                },
                {
                    privateIPAddress: '10.10.10.10',
                    primary: false,
                    publicIPAddress: {
                        id: 'vip-pip2'
                    },
                    provisioningState: 'Succeeded'
                }
            ]
        };
        const nic02 = {
            id: 'test-nic02',
            name: 'nic02',
            type: 'networkInterfaces',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.2',
                    primary: true,
                    publicIPAddress: {
                        id: 'vip-pip3'
                    },
                    provisioningState: 'Succeeded',
                    subnet: {
                        id: 'foo'
                    }
                },
                {
                    privateIPAddress: '10.10.10.100',
                    primary: false,
                    provisioningState: 'Succeeded'
                }
            ]
        };
        //  Use nic03-nic06 to validate same-net, moving the secondary ipConfigurations
        const nic03 = {
            id: 'test-nic03',
            name: 'nic03',
            provisioningState: 'Succeeded',
            type: 'networkInterfaces',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.3',
                    primary: true,
                    publicIPAddress: {
                        id: 'vip-pip5'
                    },
                    provisioningState: 'Succeeded',
                    subnet: {
                        id: 'foo'
                    }
                },
                {
                    privateIPAddress: '10.10.10.20',
                    primary: false,
                    publicIPAddress: {
                        id: 'vip-pip6'
                    },
                    provisioningState: 'Succeeded'
                },
                {
                    privateIPAddress: '10.10.10.21',
                    primary: false,
                    publicIPAddress: {
                        id: 'vip-pip7'
                    },
                    provisioningState: 'Succeeded'
                }
            ],
            tags: {
                f5_cloud_failover_label: 'tagsNic',
                f5_cloud_failover_nic_map: 'external'
            }
        };
        const nic04 = {
            id: 'test-nic04',
            name: 'nic04',
            provisioningState: 'Succeeded',
            type: 'networkInterfaces',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.4',
                    primary: true,
                    publicIPAddress: {
                        id: 'vip-pip6'
                    },
                    provisioningState: 'Succeeded',
                    subnet: {
                        id: 'foo'
                    }
                }
            ],
            tags: {
                f5_cloud_failover_label: 'tagsNic',
                f5_cloud_failover_nic_map: 'external'
            }
        };
        const nic05 = {
            id: 'test-nic05',
            name: 'nic05',
            provisioningState: 'Succeeded',
            type: 'networkInterfaces',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.11.3',
                    primary: true,
                    provisioningState: 'Succeeded',
                    subnet: {
                        id: 'bar'
                    }
                },
                {
                    privateIPAddress: '10.10.11.20',
                    primary: false,
                    provisioningState: 'Succeeded'
                },
                {
                    privateIPAddress: '10.10.11.21',
                    primary: false,
                    provisioningState: 'Succeeded'
                }
            ],
            tags: {
                f5_cloud_failover_label: 'tagsNic',
                f5_cloud_failover_nic_map: 'internal'
            }
        };
        const nic06 = {
            id: 'test-nic06',
            name: 'nic06',
            provisioningState: 'Succeeded',
            type: 'networkInterfaces',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.11.4',
                    primary: true,
                    provisioningState: 'Succeeded',
                    subnet: {
                        id: 'bar'
                    }
                }
            ],
            tags: {
                f5_cloud_failover_label: 'tagsNic',
                f5_cloud_failover_nic_map: 'internal'
            }
        };
        const publicIpResponse = {
            id: 'vip-pip1',
            name: 'vip-pip1',
            type: 'publicIPAddresses',
            ipConfigurations: { id: 'test-vip01' },
            ipAddress: '3.3.3.3'
        };

        it('should validate across-net public IP address gets reassociated', () => {
            const addressGroupDefinitions = [
                {
                    type: 'publicIpAddress',
                    scopingName: 'vip-pip1',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];

            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses.get = sinon.stub().resolves(publicIpResponse);
            provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();

            provider.networkClients[mockSubscriptionId].networkInterfaces.list = sinon.stub((error, callback) => {
                callback(error, [nic01, nic02]);
            });
            provider.networkClients[mockSubscriptionId].networkInterfaces.get = sinon.stub()
                .callsFake((resourceGroup, nicName) => {
                    if (nicName === 'nic01') {
                        return Promise.resolve(nic01);
                    }
                    return Promise.resolve(nic02);
                });

            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(response.publicAddresses[0].publicIpAddress.id, '/subscriptions/xxxx/resourceGroups/null/providers/Microsoft.Network/publicIPAddresses/vip-pip1');
                    assert.strictEqual(response.publicAddresses[0].current.name, 'nic01');
                    assert.strictEqual(response.publicAddresses[0].current.privateIPAddress, '10.10.10.10');
                    assert.strictEqual(response.publicAddresses[0].target.name, 'nic02');
                    assert.strictEqual(response.publicAddresses[0].target.privateIPAddress, '10.10.10.100');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should validate across-net public IP address gets reassociated when resourceId provided as scoping name', () => {
            const addressGroupDefinitions = [
                {
                    type: 'publicIpAddress',
                    scopingName: '/subscriptions/xxxx/resourceGroups/null/providers/Microsoft.Network/publicIPAddresses/vip-pip1',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];

            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses.get = sinon.stub().resolves(publicIpResponse);
            provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();

            provider.networkClients[mockSubscriptionId].networkInterfaces.list = sinon.stub((error, callback) => {
                callback(error, [nic01, nic02]);
            });
            provider.networkClients[mockSubscriptionId].networkInterfaces.get = sinon.stub()
                .callsFake((resourceGroup, nicName) => {
                    if (nicName === 'nic01') {
                        return Promise.resolve(nic01);
                    }
                    return Promise.resolve(nic02);
                });

            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(response.publicAddresses[0].publicIpAddress.id, '/subscriptions/xxxx/resourceGroups/null/providers/Microsoft.Network/publicIPAddresses/vip-pip1');
                    assert.strictEqual(response.publicAddresses[0].current.name, 'nic01');
                    assert.strictEqual(response.publicAddresses[0].current.privateIPAddress, '10.10.10.10');
                    assert.strictEqual(response.publicAddresses[0].target.name, 'nic02');
                    assert.strictEqual(response.publicAddresses[0].target.privateIPAddress, '10.10.10.100');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should validate across-net addressGroupDefinitions vipAddresses are empty', () => {
            const addressGroupDefinitions = [
                {
                    type: 'publicIpAddress',
                    scopingName: 'vip-pip1',
                    vipAddresses: []
                }
            ];
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then(() => {
                    assert.fail();
                })
                .catch(() => assert.ok(true));
        });

        it('should validate same-net public and private addresses get reassociated', () => {
            const networkGroupDefinitions = [
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.10.20'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.10.21'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.11.20'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.11.21'
                }
            ];
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces.list = sinon.stub((error, callback) => {
                callback(error, [nic03, nic04, nic05, nic06]);
            });

            return provider.discoverAddressOperationsUsingDefinitions(addresses2, networkGroupDefinitions, options)
                .then((response) => {
                    const disasociate = response.interfaces.disassociate;
                    const associate = response.interfaces.associate;
                    assert.strictEqual(disasociate[1][1], 'nic03');
                    assert.strictEqual(disasociate[1][2].name, 'nic03');
                    assert.strictEqual(disasociate[1][2].ipConfigurations[0].privateIPAddress, '10.10.10.3');
                    assert.strictEqual(associate[1][1], 'nic04');
                    assert.strictEqual(associate[1][2].name, 'nic04');
                    assert.strictEqual(associate[1][2].ipConfigurations[0].privateIPAddress, '10.10.10.4');
                    assert.strictEqual(associate[1][2].ipConfigurations[1].privateIPAddress, '10.10.10.21');
                    assert.strictEqual(associate[1][2].ipConfigurations[2].privateIPAddress, '10.10.10.20');
                    assert.strictEqual(associate[1][2].ipConfigurations[1].publicIPAddress.id, 'vip-pip7');
                    assert.strictEqual(associate[1][2].ipConfigurations[2].publicIPAddress.id, 'vip-pip6');
                    assert.strictEqual(disasociate[0][1], 'nic05');
                    assert.strictEqual(disasociate[0][2].name, 'nic05');
                    assert.strictEqual(disasociate[0][2].ipConfigurations[0].privateIPAddress, '10.10.11.3');
                    assert.strictEqual(associate[0][1], 'nic06');
                    assert.strictEqual(associate[0][2].name, 'nic06');
                    assert.strictEqual(associate[0][2].ipConfigurations[0].privateIPAddress, '10.10.11.4');
                    assert.strictEqual(associate[0][2].ipConfigurations[1].privateIPAddress, '10.10.11.21');
                    assert.strictEqual(associate[0][2].ipConfigurations[2].privateIPAddress, '10.10.11.20');
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('function _getPublicIpAddress', () => {
        const pipResponse = {
            id: '/path/publicIPAddresses/test-pip1',
            name: 'test-pip01',
            type: 'Microsoft.Network/publicIPAddresses',
            ipConfigurations: { id: '/path/ipConfigurations/test-vip01-' },
            ipAddress: '13.13.13.13',
            location: 'westus'
        };
        it('should validate _getPublicIpAddress with resolved promise', () => {
            const options = {
                publicIpAddress: 'test-pip01'
            };
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses.get = sinon.stub().resolves(pipResponse);

            return provider._getPublicIpAddress(options)
                .then((response) => {
                    assert.strictEqual(response.name, 'test-pip01');
                    assert.strictEqual(response.ipAddress, '13.13.13.13');
                    assert.strictEqual(response.type, 'Microsoft.Network/publicIPAddresses');
                })
                .catch((err) => Promise.reject(err));
        });
        it('should validate _getPublicIpAddress name was not found', () => {
            const options = {
                publicIpAddress: 'test-value'
            };
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses.get = sinon.stub().resolves({
                name: 'not-match'
            });
            return provider._getPublicIpAddress(options)
                .then((response) => {
                    assert.strictEqual(response, undefined);
                })
                .catch((err) => Promise.reject(err));
        });
        it('should _getPublicIpAddress with promise rejection', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses = sinon.stub();
            provider.networkClients[mockSubscriptionId].publicIPAddresses.get = sinon.stub().rejects();
            return provider._getPublicIpAddress('pipName')
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('function _getNetworkInterfaceByName', () => {
        const nic01 = {
            id: 'test-nic01',
            name: 'nic01',
            type: 'networkInterfaces',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '10.10.10.1',
                    primary: true,
                    publicIPAddress: {
                        id: 'vip-pip1'
                    }
                },
                {
                    privateIPAddress: '10.10.10.11',
                    primary: false,
                    publicIPAddress: {
                        id: 'vip-pip2'
                    }
                }
            ]
        };
        it('should gets network interface resource given a network interface name', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces.get = sinon.stub().resolves(nic01);
            return provider._getNetworkInterfaceByName('nic01')
                .then((response) => {
                    assert.strictEqual(response.name, 'nic01');
                    assert.strictEqual(response.provisioningState, 'Succeeded');
                })
                .catch((err) => Promise.reject(err));
        });
        it('should reject when provided network interface name was not found', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces.get = sinon.stub().resolves({
                name: 'not-match'
            });
            return provider._getNetworkInterfaceByName('nicName')
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
        it('should reject when provided network interface state was not Succeeded', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces = sinon.stub();
            provider.networkClients[mockSubscriptionId].networkInterfaces.get = sinon.stub().resolves({
                provisioningState: 'Updating'
            });
            return provider._getNetworkInterfaceByName('nicName')
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('function _getRouteTableByName', () => {
        it('should reject when provided network interface name was not found', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].routeTables = sinon.stub();
            provider.networkClients[mockSubscriptionId].routeTables.get = sinon.stub().resolves({
                name: 'not-match'
            });
            provider._parseResourceId.subscriptionId = sinon.stub().resolves(mockSubscriptionId);

            return provider._getRouteTableByName('rg01', 'rt01', `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
        it('should reject when provided network interface state was not Succeeded', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.networkClients[mockSubscriptionId] = sinon.stub();
            provider.networkClients[mockSubscriptionId].routeTables = sinon.stub();
            provider.networkClients[mockSubscriptionId].routeTables.get = sinon.stub().resolves({
                provisioningState: 'Updating'
            });
            provider._parseResourceId.subscriptionId = sinon.stub().resolves(mockSubscriptionId);

            return provider._getRouteTableByName('rg01', 'rt01', `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('function _reassociatePublicIpAddresses', () => {
        const publicIpAddresses = [
            {
                publicIpAddressId: {
                    id: '/subscriptions/xxxx/resourceGroups/null/providers/Microsoft.Network/publicIPAddresses/vip-pip1'
                },
                current: {
                    name: 'nic01',
                    privateIPAddress: '10.10.10.10'
                },
                target: {
                    name: 'nic02',
                    privateIPAddress: '10.10.10.20'
                }
            }
        ];

        it('should resassociate public ip address from current to target', () => {
            provider.nics = [
                {
                    name: 'nic01',
                    ipConfigurations: [
                        {
                            privateIPAddress: '10.10.10.10',
                            publicIPAddress: {
                                id: 'some-id-here'
                            }
                        }
                    ]
                },
                {
                    name: 'nic02',
                    ipConfigurations: [
                        {
                            privateIPAddress: '10.10.10.20'
                        }
                    ]
                }
            ];
            provider._updateNic = sinon.stub();
            provider._updateNic.onCall(0).resolves();
            provider._updateNic.onCall(1).resolves();
            provider._getNetworkInterfaceByName = sinon.stub();
            provider._getNetworkInterfaceByName.onCall(0).resolves();
            provider._getNetworkInterfaceByName.onCall(1).resolves();
            return provider._reassociatePublicIpAddresses(publicIpAddresses)
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });
    });
});
