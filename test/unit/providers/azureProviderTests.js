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
    let provider;
    let srcUtil;

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
        srcUtil = require('../../../src/nodejs/util.js');
    });
    beforeEach(() => {
        const Device = require('../../../src/nodejs/device.js');
        sinon.stub(Device.prototype, 'init').resolves();
        sinon.stub(Device.prototype, 'getProxySettings').resolves({
            host: '',
            port: 8080,
            protocol: 'http'
        });

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
        sinon.stub(srcUtil, 'makeRequest').resolves(mockMetadata);

        const storageAccounts = [
            {
                name: 'foo',
                tags: {
                    foo: 'bar'
                }
            }
        ];
        provider._listStorageAccounts = sinon.stub().resolves(storageAccounts);
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init()
            .then(() => {
                assert.strictEqual(provider.resourceGroup, mockResourceGroup);
                assert.strictEqual(provider.primarySubscriptionId, mockSubscriptionId);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should initialize azure provider with custom enviroments', () => {
        sinon.stub(srcUtil, 'makeRequest').resolves(mockMetadata);

        const storageAccounts = [
            {
                name: 'foo',
                tags: {
                    foo: 'bar'
                }
            }
        ];
        provider._listStorageAccounts = sinon.stub().resolves(storageAccounts);
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
            })
            .catch((err) => Promise.reject(err));
    });

    it('should initialize azure provider and throw error about missing storage account', () => {
        sinon.stub(srcUtil, 'makeRequest').resolves(mockMetadata);

        provider._listStorageAccounts = sinon.stub().resolves([]);
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
        sinon.stub(srcUtil, 'makeRequest').resolves(mockMetadata);

        const listStorageAccountsSpy = sinon.spy(provider, '_listStorageAccounts');
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init({ storageName: 'foo' })
            .then(() => {
                assert.strictEqual(listStorageAccountsSpy.called, false);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate if storageTags are set and storageName is not then return _listStorageAccounts', () => {
        sinon.stub(srcUtil, 'makeRequest').resolves(mockMetadata);

        const storageAccountResponse = [
            {
                name: 'foo'
            }
        ];

        provider._listStorageAccounts = sinon.stub().resolves(storageAccountResponse);
        provider._initStorageAccountContainer = sinon.stub().resolves();

        return provider.init({ tags: { foo: 'bar' } })
            .then(() => {
                assert.strictEqual(provider._listStorageAccounts.called, true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should _getInstanceMetadata with promise rejection', () => {
        srcUtil.makeRequest = sinon.stub().rejects();

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
        const listResponse = {
            value: [
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
            ]
        };
        provider._makeRequest = sinon.stub().resolves(listResponse);

        return provider._listStorageAccounts()
            .then((storageAccounts) => {
                assert.deepStrictEqual(listResponse.value, storageAccounts);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _listStorageAccounts returns tagged instances', () => {
        const listResponse = {
            value: [
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
            ]
        };
        provider._makeRequest = sinon.stub().resolves(listResponse);

        return provider._listStorageAccounts({ tags: { foo: 'bar' } })
            .then((storageAccounts) => {
                assert.deepStrictEqual([listResponse.value[0]], storageAccounts);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _initStorageAccountContainer resolves when container already exists', () => {
        const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
        <EnumerationResults ServiceEndpoint="https://mysa.blob.core.windows.net">
          <Containers>
            <Container>
              <Name>f5cloudfailover</Name>
              </Properties>
              <Metadata>
                <metadata-name>value</metadata-name>
              </Metadata>
            </Container>
          </Containers>
        </EnumerationResults>`;

        this.storageName = 'mysa';
        provider._makeRequest = sinon.stub().resolves(xmlResponse);

        return provider._initStorageAccountContainer('mysa')
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _initStorageAccountContainer resolves when container does not exist', () => {
        const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
        <EnumerationResults ServiceEndpoint="https://mysa.blob.core.windows.net">
          <Containers>
            <Container>
              <Name>container-name</Name>
              </Properties>
              <Metadata>
                <metadata-name>value</metadata-name>
              </Metadata>
            </Container>
          </Containers>
        </EnumerationResults>`;

        this.storageName = 'mysa';
        provider._makeRequest = sinon.stub().resolves(xmlResponse);

        return provider._initStorageAccountContainer()
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _initStorageAccountContainer resolves when the first container is not ours', () => {
        const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
        <EnumerationResults ServiceEndpoint="https://mysa.blob.core.windows.net">
          <Containers>
          <Container>
              <Name>container-name</Name>
              </Properties>
              <Metadata>
                <metadata-name>value</metadata-name>
              </Metadata>
          </Container>  
          <Container>
              <Name>f5cloudfailover</Name>
              </Properties>
              <Metadata>
                <metadata-name>value</metadata-name>
              </Metadata>
            </Container>
          </Containers>
        </EnumerationResults>`;

        this.storageName = 'mysa';
        provider._makeRequest = sinon.stub().resolves(xmlResponse);

        return provider._initStorageAccountContainer('mysa')
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _initStorageAccountContainer returns reject promise', () => {
        provider._makeRequest = sinon.stub().resolves({});

        return provider._initStorageAccountContainer()
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
                name: 'nic01',
                location: 'location01',
                properties: {
                    provisioningState: 'Succeeded',
                    enableIPForwarding: false,
                    networkSecurityGroup: 'nsgNic01',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '1.1.1.1'
                            }
                        },
                        {
                            properties: {
                                privateIPAddress: '10.10.10.10',
                                subnet: {
                                    id: 'my-subnet-resource-location'
                                },
                                primary: false,
                                publicIPAddress: {
                                    id: 'vip-pip1'
                                }
                            }
                        }
                    ]
                },
                tags: {
                    f5_cloud_failover_label: 'tagsNic01',
                    f5_cloud_failover_nic_map: 'external'
                }
            },
            {
                id: 'id_nic02',
                name: 'nic02',
                location: 'location02',
                properties: {
                    provisioningState: 'Succeeded',
                    enableIPForwarding: false,
                    networkSecurityGroup: 'nsgNic02',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '2.2.2.2'
                            }
                        }
                    ]
                },
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
                assert.deepStrictEqual(disassociateArgs[0][2].properties.ipConfigurations[0].properties.privateIPAddress, '1.1.1.1');

                const associateArgs = updateAddressesSpy.getCall(0).args[0].associate;
                assert.strictEqual(associateArgs[0][1], 'nic02');
                assert.deepStrictEqual(associateArgs[0][2].properties.ipConfigurations[0].properties.privateIPAddress, '2.2.2.2');
                assert.deepStrictEqual(associateArgs[0][2].properties.ipConfigurations[1].properties.privateIPAddress, '10.10.10.10');
                assert.deepStrictEqual(associateArgs[0][2].properties.ipConfigurations[1].properties.subnet.id, 'my-subnet-resource-location');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should validate updateAddresses does not perform discovery due to mismatched nic tags', () => {
        const localAddresses = ['2.2.2.2'];
        const failoverAddresses = ['10.10.10.10'];
        const listNicsResponse = [
            {
                id: 'id_nic01',
                name: 'nic01',
                location: 'location01',
                properties: {
                    provisioningState: 'Succeeded',
                    enableIPForwarding: false,
                    networkSecurityGroup: 'nsgNic01',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '1.1.1.1'
                            }
                        },
                        {
                            properties: {
                                privateIPAddress: '10.10.10.10'
                            }
                        }
                    ]
                },
                tags: {
                    f5_cloud_failover_label: 'tagsNic01',
                    f5_cloud_failover_nic_map: 'external'
                }
            },
            {
                id: 'id_nic02',
                name: 'nic02',
                location: 'location02',
                properties: {
                    provisioningState: 'Succeeded',
                    enableIPForwarding: false,
                    networkSecurityGroup: 'nsgNic02',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '2.2.2.2'
                            }
                        }
                    ]
                },
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
        const nicResponse = {
            name: 'nic01',
            location: 'location02',
            tags: 'tagsNic01',
            properties: {
                enableIPForwarding: true,
                ipConfigurations: [],
                networkSecurityGroup: 'nsgNic01',
                provisioningState: 'Succeeded'
            }
        };
        provider._makeRequest = sinon.stub().resolves(nicResponse);

        const nicParams = {
            enableIPForwarding: true,
            ipConfigurations: [],
            location: 'location02',
            networkSecurityGroup: 'nsgNic01',
            tags: 'tagsNic01'
        };

        return provider._updateNic('resourceGroup01', 'nic01', nicParams, 'Dissasociate')
            .then((updateNicsResponse) => {
                assert.strictEqual(updateNicsResponse.name, 'nic01');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _updateNic promise rejection', () => {
        provider.primarySubscriptionId = mockSubscriptionId;
        provider._makeRequest = sinon.stub().rejects();

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

        const nicResponse = {
            value: [
                {
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
                        tag01: 'value01',
                        tag02: 'value02'
                    }
                }
            ]
        };

        provider.primarySubscriptionId = mockSubscriptionId;
        provider._makeRequest = sinon.stub().resolves(nicResponse);

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

        const nicResponse = {
            value: [
                {
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
                }
            ]
        };

        provider.primarySubscriptionId = mockSubscriptionId;
        provider._makeRequest = sinon.stub().resolves(nicResponse);

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
        provider._makeRequest = sinon.stub().rejects();

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
            value: [
                {
                    id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                    name: 'rt01',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                    },
                    properties: {
                        provisioningState: 'Succeeded',
                        routes: [
                            {
                                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.0.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.10',
                                    provisioningState: 'Succeeded'
                                },
                                etag: 'foo'
                            },
                            {
                                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                                name: 'route03',
                                properties: {
                                    addressPrefix: 'ace:cab:deca:defe::/64',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: 'ace:cab:deca:deee::4',
                                    provisioningState: 'Succeeded'
                                },
                                etag: 'foo'
                            }
                        ]
                    }
                },
                {
                    id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt02`,
                    name: 'rt02',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                    },
                    properties: {
                        provisioningState: 'Succeeded',
                        routes: [
                            {
                                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route02`,
                                name: 'route02',
                                properties: {
                                    addressPrefix: '192.0.1.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.12',
                                    provisioningState: 'Succeeded'
                                },
                                etag: 'foo'
                            }
                        ]
                    }
                },
                {
                    id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/rt03`,
                    name: 'rt03',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                    },
                    properties: {
                        provisioningState: 'Succeeded',
                        routes: [
                            {
                                id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/route01`,
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.10.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.12'
                                }
                            }
                        ]
                    }
                }
            ]
        };

        beforeEach(() => {
            srcUtil.makeRequest = sinon.stub().resolves(mockMetadata);
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
                    provider._makeRequest = sinon.stub().resolves(routeTablesBySubscription);
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
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            properties: {
                                addressPrefix: 'ace:cab:deca:defe::/64',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: 'ace:cab:deca:deee::4',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
            });

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });

        it('update multiple routes using next hop discovery method: static', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            properties: {
                                addressPrefix: 'ace:cab:deca:defe::/64',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: 'ace:cab:deca:deee::4',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
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
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });

        it('update IPv6 routes using next hop discovery method: static', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            properties: {
                                addressPrefix: 'ace:cab:deca:defe::/64',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: 'ace:cab:deca:deee::4',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
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
                    assert.ok(true);
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
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes across multiple subscriptions', () => {
            sinon.stub(provider, '_getRouteTableConfig')
                .onFirstCall().resolves({
                    id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                    name: 'rt01',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                    },
                    properties: {
                        provisioningState: 'Succeeded',
                        routes: [
                            {
                                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.0.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.10',
                                    provisioningState: 'Succeeded'
                                },
                                etag: 'foo'
                            },
                            {
                                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                                name: 'route03',
                                properties: {
                                    addressPrefix: 'ace:cab:deca:defe::/64',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: 'ace:cab:deca:deee::4',
                                    provisioningState: 'Succeeded'
                                },
                                etag: 'foo'
                            }
                        ]
                    }
                })
                .onSecondCall()
                .resolves({
                    id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/rt03`,
                    name: 'rt03',
                    etag: 'foo',
                    tags: {
                        F5_LABEL: 'foo',
                        F5_SELF_IPS: '10.0.1.12,10.0.1.13'
                    },
                    properties: {
                        provisioningState: 'Succeeded',
                        routes: [
                            {
                                id: `/subscriptions/${secondarySubscriptionId}/resourceGroups/rg02/route01`,
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.10.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.12',
                                    provisioningState: 'Succeeded'
                                },
                                etag: 'foo'
                            }
                        ]
                    }
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
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using multiple route group definitions', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            properties: {
                                addressPrefix: 'ace:cab:deca:defe::/64',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: 'ace:cab:deca:deee::4',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
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
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using route name', () => {
            sinon.stub(provider, '_getRouteTableConfig').resolves({
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                etag: 'foo',
                tags: {
                    F5_LABEL: 'foo',
                    F5_SELF_IPS: '10.0.1.10,10.0.1.11,ace:cab:deca:deee::4,ace:cab:deca:deee::5'
                },
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        },
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route03`,
                            name: 'route03',
                            properties: {
                                addressPrefix: 'ace:cab:deca:defe::/64',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: 'ace:cab:deca:deee::4',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
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
                    assert.ok(true);
                })
                .catch((err) => Promise.reject(err));
        });
    });

    it('should execute downloadDataFromStorage', () => {
        const payload = { body: { foo: 'bar' } };
        provider._makeRequest = sinon.stub().resolves(payload);
        return provider.downloadDataFromStorage('myfile')
            .then((data) => {
                assert.strictEqual(data.foo, 'bar');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should execute downloadDataFromStorage and return empty object if file does not exist', () => {
        const payload = { code: 404, body: {} };
        provider._makeRequest = sinon.stub().resolves(payload);
        return provider.downloadDataFromStorage('myfile')
            .then((data) => {
                assert.deepStrictEqual(data, {});
            })
            .catch((err) => Promise.reject(err));
    });

    it('should execute uploadDataToStorage', () => {
        const payload = { foo: 'bar' };
        const response = { code: 200, body: { foo: 'bar' } };
        provider._makeRequest = sinon.stub().resolves(response);

        return provider.uploadDataToStorage('myfile', payload)
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _makeRequest', () => {
        const method = 'GET';
        const requestUrl = '/';
        const options = {};
        const payload = { some_key: 'some_value' };

        provider.resourceToken = 'foo';
        provider.storageToken = 'bar';

        srcUtil.makeRequest = sinon.stub().resolves(payload);

        return provider._makeRequest(method, requestUrl, options)
            .then((data) => {
                assert.strictEqual(data, payload);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _makeRequest rejects when no access token is provided', () => {
        const method = 'GET';
        const requestUrl = '/';
        const options = {};

        return provider._makeRequest(method, requestUrl, options)
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, '_makeRequest: no auth token. call init first');
            });
    });

    it('validate _createResourceID', () => {
        const options = { provider: 'some_provider', name: 'some_name' };
        provider.primarySubscriptionId = 'some_subscription';
        provider.resourceGroup = 'some_group';
        const resourceID = provider._createResourceID(options);
        assert.strictEqual(resourceID, '/subscriptions/some_subscription/resourceGroups/some_group/providers/some_provider/some_name');
    });

    it('validate _getAuthToken', () => {
        const payload = { access_token: 'some_token' };
        srcUtil.makeRequest = sinon.stub().resolves(payload);

        return provider._getAuthToken('https://management.azure.com')
            .then((data) => {
                assert.strictEqual(data, payload.access_token);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _getAuthToken rejects when no access token is returned', () => {
        srcUtil.makeRequest = sinon.stub().rejects();

        return provider._getAuthToken('https://management.azure.com')
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'Error getting auth token Error: Error');
            });
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
                            ipAddress: [
                                {
                                    privateIpAddress: '1.1.1.1',
                                    publicIpAddress: '100.100.100.100'
                                }
                            ]
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
                properties: {
                    routes: [
                        {
                            id: 'id_route01',
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '1.1.1.1'
                            }
                        }
                    ],
                    subnets: [
                        {
                            id: '/foo/foo/foo/rg01/subnets/internal'
                        }
                    ]
                }

            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '1.1.1.1',
                                    publicIPAddress: {
                                        id: '/some-path/public-ip-name'
                                    }
                                }
                            }
                        ]
                    }
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
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '1.1.1.1',
                                    publicIPAddress: {
                                        id: '/some-path/public-ip-name'
                                    }
                                }
                            }
                        ]
                    }
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
                properties: {
                    routes: [
                        {
                            id: 'id_route01',
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '1.1.1.1'
                            }
                        }
                    ],
                    subnets: [
                        {
                            id: '/foo/foo/foo/rg01/subnets/internal'
                        }
                    ]
                }
            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '1.1.1.1',
                                    publicIPAddress: {
                                        id: '/some-path/public-ip-name'
                                    }
                                }
                            }
                        ]
                    }
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
                properties: {
                    routes: [
                        {
                            id: 'id_route01',
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '1.1.1.1'
                            }
                        },
                        {
                            id: 'id_route02',
                            name: 'route02',
                            properties: {
                                addressPrefix: 'ace:cab:deca:defe::/64',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: 'ace:cab:deca:deee::4'
                            }
                        }
                    ],
                    subnets: [
                        {
                            id: '/foo/foo/foo/rg01/subnets/internal'
                        }
                    ]
                }
            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '1.1.1.1',
                                    publicIPAddress: {
                                        id: '/some-path/public-ip-name'
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    id: '/some-path/nic/another-id',
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: 'ace:cab:deca:deee::4',
                                    publicIPAddress: {
                                        id: '/some-path/public-ip-name'
                                    }
                                }
                            }
                        ]
                    }
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
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '1.1.1.1',
                                    publicIPAddress: {
                                        id: '/some-path/public-ip-name'
                                    }
                                }
                            }
                        ]
                    }
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
            localAddresses: ['10.10.10.4', '10.10.11.4'],
            failoverAddresses: []
        };
        const nics = [
            {
                id: 'test-nic03',
                name: 'nic03',
                type: 'networkInterfaces',
                properties: {
                    provisioningState: 'Succeeded',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '10.10.10.3',
                                primary: true,
                                publicIPAddress: {
                                    id: 'vip-pip5'
                                },
                                provisioningState: 'Succeeded',
                                subnet: {
                                    id: 'foo'
                                }
                            }
                        },
                        {
                            properties: {
                                privateIPAddress: '10.10.10.20',
                                primary: false,
                                publicIPAddress: {
                                    id: 'vip-pip6'
                                },
                                provisioningState: 'Succeeded'
                            }
                        },
                        {
                            properties: {
                                privateIPAddress: '10.10.10.21',
                                primary: false,
                                publicIPAddress: {
                                    id: 'vip-pip7'
                                },
                                provisioningState: 'Succeeded'
                            }
                        }
                    ]
                },
                tags: {
                    f5_cloud_failover_label: 'tagsNic',
                    f5_cloud_failover_nic_map: 'external'
                }
            },
            {
                id: 'test-nic04',
                name: 'nic04',
                type: 'networkInterfaces',
                properties: {
                    provisioningState: 'Succeeded',
                    ipConfigurations: [
                        {
                            properties: {
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
                        }
                    ]
                },
                tags: {
                    f5_cloud_failover_label: 'tagsNic',
                    f5_cloud_failover_nic_map: 'external'
                }
            },
            {
                id: 'test-nic05',
                name: 'nic05',
                type: 'networkInterfaces',
                properties: {
                    provisioningState: 'Succeeded',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '10.10.11.3',
                                primary: true,
                                provisioningState: 'Succeeded',
                                subnet: {
                                    id: 'bar'
                                }
                            }
                        },
                        {
                            properties: {
                                privateIPAddress: '10.10.11.20',
                                primary: false,
                                provisioningState: 'Succeeded'
                            }
                        },
                        {
                            properties: {
                                privateIPAddress: '10.10.11.21',
                                primary: false,
                                provisioningState: 'Succeeded'
                            }
                        }
                    ]
                },
                tags: {
                    f5_cloud_failover_label: 'tagsNic',
                    f5_cloud_failover_nic_map: 'internal'
                }
            },
            {
                id: 'test-nic06',
                name: 'nic06',
                type: 'networkInterfaces',
                properties: {
                    provisioningState: 'Succeeded',
                    ipConfigurations: [
                        {
                            properties: {
                                privateIPAddress: '10.10.11.4',
                                primary: true,
                                provisioningState: 'Succeeded',
                                subnet: {
                                    id: 'bar'
                                }
                            }
                        }
                    ]
                },
                tags: {
                    f5_cloud_failover_label: 'tagsNic',
                    f5_cloud_failover_nic_map: 'internal'
                }
            }
        ];

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
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves();
            provider._getInstanceMetadata = sinon.stub().resolves();
            provider._listNics = sinon.stub().resolves(nics);

            return provider.discoverAddressOperationsUsingDefinitions(addresses, networkGroupDefinitions, options)
                .then((response) => {
                    const disasociate = response.interfaces.disassociate;
                    const associate = response.interfaces.associate;
                    assert.strictEqual(disasociate[1][1], 'nic03');
                    assert.strictEqual(disasociate[1][2].name, 'nic03');
                    assert.strictEqual(disasociate[1][2].properties.ipConfigurations[0].properties.privateIPAddress, '10.10.10.3');
                    assert.strictEqual(associate[1][1], 'nic04');
                    assert.strictEqual(associate[1][2].name, 'nic04');
                    assert.strictEqual(associate[1][2].properties.ipConfigurations[0].properties.privateIPAddress, '10.10.10.4');
                    assert.strictEqual(associate[1][2].properties.ipConfigurations[1].properties.privateIPAddress, '10.10.10.21');
                    assert.strictEqual(associate[1][2].properties.ipConfigurations[2].properties.privateIPAddress, '10.10.10.20');
                    assert.strictEqual(associate[1][2].properties.ipConfigurations[1].properties.publicIPAddress.id, 'vip-pip7');
                    assert.strictEqual(associate[1][2].properties.ipConfigurations[2].properties.publicIPAddress.id, 'vip-pip6');
                    assert.strictEqual(disasociate[0][1], 'nic05');
                    assert.strictEqual(disasociate[0][2].name, 'nic05');
                    assert.strictEqual(disasociate[0][2].properties.ipConfigurations[0].properties.privateIPAddress, '10.10.11.3');
                    assert.strictEqual(associate[0][1], 'nic06');
                    assert.strictEqual(associate[0][2].name, 'nic06');
                    assert.strictEqual(associate[0][2].properties.ipConfigurations[0].properties.privateIPAddress, '10.10.11.4');
                    assert.strictEqual(associate[0][2].properties.ipConfigurations[1].properties.privateIPAddress, '10.10.11.21');
                    assert.strictEqual(associate[0][2].properties.ipConfigurations[2].properties.privateIPAddress, '10.10.11.20');
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
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves(pipResponse);

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
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves(pipResponse);

            return provider._getPublicIpAddress(options)
                .then((response) => {
                    assert.strictEqual(response, undefined);
                })
                .catch((err) => Promise.reject(err));
        });
        it('should _getPublicIpAddress with promise rejection', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves(pipResponse);

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
            properties: {
                provisioningState: 'Succeeded',
                ipConfigurations: [
                    {
                        properties: {
                            privateIPAddress: '10.10.10.1',
                            primary: true,
                            publicIPAddress: {
                                id: 'vip-pip1'
                            }
                        }
                    },
                    {
                        properties: {
                            privateIPAddress: '10.10.10.11',
                            primary: false,
                            publicIPAddress: {
                                id: 'vip-pip2'
                            }
                        }
                    }
                ]
            }
        };

        const nic02 = {
            id: 'test-nic02',
            name: 'nic02',
            type: 'networkInterfaces',
            properties: {
                provisioningState: 'Updating',
                ipConfigurations: [
                    {
                        properties: {
                            privateIPAddress: '10.10.10.1',
                            primary: true,
                            publicIPAddress: {
                                id: 'vip-pip1'
                            }
                        }
                    },
                    {
                        properties: {
                            privateIPAddress: '10.10.10.11',
                            primary: false,
                            publicIPAddress: {
                                id: 'vip-pip2'
                            }
                        }
                    }
                ]
            }
        };

        it('should gets network interface resource given a network interface name', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves(nic01);

            return provider._getNetworkInterfaceByName('nic01')
                .then((response) => {
                    assert.strictEqual(response.name, 'nic01');
                    assert.strictEqual(response.properties.provisioningState, 'Succeeded');
                })
                .catch((err) => Promise.reject(err));
        });
        it('should reject when provided network interface name was not found', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves(nic01);

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
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().resolves(nic02);

            return provider._getNetworkInterfaceByName('nic02')
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('function _getRouteTableByName', () => {
        it('should return route table config', () => {
            const routeTable = {
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
            };
            provider.primarySubscriptionId = mockSubscriptionId;
            provider._parseResourceId.subscriptionId = sinon.stub().resolves(mockSubscriptionId);
            provider._makeRequest = sinon.stub().resolves(routeTable);

            return provider._getRouteTableByName('rg01', 'rt01', `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then((response) => {
                    assert.strictEqual(response.properties.provisioningState, 'Succeeded');
                })
                .catch((err) => Promise.reject(err));
        });
        it('should reject when route table is not ready yet', () => {
            const routeTable = {
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                properties: {
                    provisioningState: 'Updating',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
            };
            provider.primarySubscriptionId = mockSubscriptionId;
            provider._parseResourceId.subscriptionId = sinon.stub().resolves(mockSubscriptionId);
            provider._makeRequest = sinon.stub().resolves(routeTable);

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

    describe('function _getRouteTableConfig', () => {
        it('should return route table config', () => {
            const routeTable = {
                id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`,
                name: 'rt01',
                properties: {
                    provisioningState: 'Succeeded',
                    routes: [
                        {
                            id: `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/route01`,
                            name: 'route01',
                            properties: {
                                addressPrefix: '192.0.0.0/24',
                                nextHopType: 'VirtualAppliance',
                                nextHopIpAddress: '10.0.1.10',
                                provisioningState: 'Succeeded'
                            },
                            etag: 'foo'
                        }
                    ]
                }
            };
            provider.primarySubscriptionId = mockSubscriptionId;
            provider._parseResourceId.subscriptionId = sinon.stub().resolves(mockSubscriptionId);
            provider._makeRequest = sinon.stub().resolves(routeTable);

            return provider._getRouteTableConfig('rg01', 'rt01', `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then((response) => {
                    assert.strictEqual(response.name, 'rt01');
                })
                .catch((err) => Promise.reject(err));
        });
        it('should reject when no response', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider._parseResourceId.subscriptionId = sinon.stub().resolves(mockSubscriptionId);
            provider._makeRequest = sinon.stub().rejects();

            return provider._getRouteTableByName('rg01', 'rt01', `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then(() => {
                    assert.fail();
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('function _getRouteTables', () => {
        it('should return one page of results', () => {
            provider._makeRequest = sinon.stub().resolves({ value: [{ some_key: 'some_value' }] });
            provider.subscriptions = [{ id: 'xxxx' }];
            return provider._getRouteTables()
                .then((response) => {
                    assert.strictEqual(response[0].some_key, 'some_value');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should return multiple pages of results', () => {
            provider._makeRequest = sinon.stub()
                .onFirstCall()
                .resolves({ value: [{ some_key: 'some_value' }], nextLink: 'nextLink' })
                .onSecondCall()
                .resolves({ value: [{ some_other_key: 'some_other_value' }] });
            provider.subscriptions = [{ id: 'xxxx' }];
            return provider._getRouteTables()
                .then((response) => {
                    assert.strictEqual(response[1].some_other_key, 'some_other_value');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should reject when _listRouteTablesBySubscription fails', () => {
            provider._makeRequest = sinon.stub().rejects(new Error('route-tables-error'));
            provider.subscriptions = ['xxxx'];
            return provider._getRouteTables()
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.ok(error.message.includes('route-tables-error'));
                });
        });
    });

    it('validate getRegion returns region', () => {
        provider.region = 'westus';
        assert.strictEqual(provider.getRegion(), 'westus');
    });

    it('validate _makeRequest uses storage token for storage requestScope', () => {
        provider.resourceToken = 'resource-token';
        provider.storageToken = 'storage-token';
        srcUtil.makeRequest = sinon.stub().resolves({ result: 'ok' });

        return provider._makeRequest('GET', 'https://mystorage.blob.core.windows.net/container/file', { requestScope: 'storage' })
            .then(() => {
                const callOpts = srcUtil.makeRequest.args[0][2];
                assert.ok(callOpts.headers.Authorization.includes('storage-token'));
            });
    });

    it('validate _makeRequest rejects when retrier fails', () => {
        provider.resourceToken = 'resource-token';
        provider.storageToken = 'storage-token';
        sinon.stub(provider, '_retrier').callsFake((fn, args) => fn.apply(provider, args));
        srcUtil.makeRequest = sinon.stub().rejects(new Error('request-failed'));

        return provider._makeRequest('GET', 'https://example.com/path', {})
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'request-failed');
            });
    });

    it('validate _makeRequest parses query string from URL', () => {
        provider.resourceToken = 'resource-token';
        provider.storageToken = 'storage-token';
        srcUtil.makeRequest = sinon.stub().resolves({ result: 'ok' });

        return provider._makeRequest('GET', 'https://example.com/path?key=value&other=param', {})
            .then(() => {
                const callOpts = srcUtil.makeRequest.args[0][2];
                assert.strictEqual(callOpts.queryParams.key, 'value');
                assert.strictEqual(callOpts.queryParams.other, 'param');
            });
    });

    it('validate _makeRequest sets default options', () => {
        provider.resourceToken = 'resource-token';
        provider.storageToken = 'storage-token';
        srcUtil.makeRequest = sinon.stub().resolves({ result: 'ok' });

        return provider._makeRequest('PUT', 'https://example.com/path', {})
            .then(() => {
                const callOpts = srcUtil.makeRequest.args[0][2];
                assert.strictEqual(callOpts.method, 'PUT');
                assert.strictEqual(callOpts.body, '');
                assert.strictEqual(callOpts.advancedReturn, false);
                assert.strictEqual(callOpts.continueOnError, false);
                assert.strictEqual(callOpts.validateStatus, false);
                assert.strictEqual(callOpts.proxy, false);
                assert.strictEqual(callOpts.httpsAgent, null);
            });
    });

    describe('updateAddresses should', () => {
        it('use updateOperations when provided', () => {
            const updateStub = sinon.stub(provider, '_updateAddresses').resolves();
            const operations = {
                interfaces: {
                    disassociate: [],
                    associate: []
                }
            };
            return provider.updateAddresses({ updateOperations: operations })
                .then(() => {
                    assert.ok(updateStub.calledOnce);
                    assert.deepStrictEqual(updateStub.args[0][0], operations);
                });
        });

        it('discover and update when no updateOperations', () => {
            const discoverStub = sinon.stub(provider, '_discoverAddressOperations').resolves({
                interfaces: {
                    disassociate: [],
                    associate: []
                }
            });
            const updateStub = sinon.stub(provider, '_updateAddresses').resolves();

            return provider.updateAddresses({
                localAddresses: ['1.1.1.1'],
                failoverAddresses: ['2.2.2.2']
            })
                .then(() => {
                    assert.ok(discoverStub.calledOnce);
                    assert.ok(updateStub.calledOnce);
                });
        });

        it('reject when updateOperations update fails', () => {
            sinon.stub(provider, '_updateAddresses').rejects(new Error('update-error'));

            return provider.updateAddresses({ updateOperations: { interfaces: {} } })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'update-error');
                });
        });

        it('reject when discover and update fails', () => {
            sinon.stub(provider, '_discoverAddressOperations').rejects(new Error('discover-error'));

            return provider.updateAddresses({
                localAddresses: ['1.1.1.1'],
                failoverAddresses: ['2.2.2.2']
            })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'discover-error');
                });
        });
    });

    describe('discoverAddresses should', () => {
        it('discover addresses with valid options', () => {
            sinon.stub(provider, '_discoverAddressOperations').resolves({
                publicAddresses: [],
                interfaces: {
                    disassociate: [],
                    associate: []
                },
                loadBalancerAddresses: {}
            });

            return provider.discoverAddresses({
                localAddresses: ['1.1.1.1'],
                failoverAddresses: ['2.2.2.2']
            })
                .then((result) => {
                    assert.ok(result.interfaces);
                });
        });

        it('discover addresses with empty options', () => {
            sinon.stub(provider, '_discoverAddressOperations').resolves({
                publicAddresses: [],
                interfaces: {
                    disassociate: [],
                    associate: []
                },
                loadBalancerAddresses: {}
            });

            return provider.discoverAddresses()
                .then((result) => {
                    assert.ok(result);
                });
        });

        it('reject when discovery fails', () => {
            sinon.stub(provider, '_discoverAddressOperations').rejects(new Error('discover-error'));

            return provider.discoverAddresses({ localAddresses: ['1.1.1.1'] })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'discover-error');
                });
        });
    });

    describe('uploadDataToStorage should', () => {
        it('reject when _makeRequest fails', () => {
            provider._makeRequest = sinon.stub().rejects(new Error('upload-failure'));
            provider.storageName = 'mysa';
            provider.environment = { storageEndpointSuffix: '.core.windows.net' };

            return provider.uploadDataToStorage('test.json', { data: 'value' })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.ok(error.message.includes('Error in uploadDataToStorage'));
                });
        });
    });

    describe('downloadDataFromStorage should', () => {
        it('reject when _makeRequest fails', () => {
            provider._makeRequest = sinon.stub().rejects(new Error('download-failure'));
            provider.storageName = 'mysa';
            provider.environment = { storageEndpointSuffix: '.core.windows.net' };

            return provider.downloadDataFromStorage('test.json')
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.ok(error.message.includes('Error in downloadDataFromStorage'));
                });
        });
    });

    describe('discoverAddressOperationsUsingDefinitions should', () => {
        it('resolve when no networkInterfaceAddress definitions', () => {
            const addresses = { localAddresses: ['10.0.0.1'] };
            const definitions = [{ type: 'otherType', scopingAddress: '10.0.0.2' }];
            provider._listNics = sinon.stub().resolves([]);

            return provider.discoverAddressOperationsUsingDefinitions(addresses, definitions, {})
                .then((result) => {
                    assert.ok(result.interfaces);
                    assert.deepStrictEqual(result.interfaces.disassociate, []);
                    assert.deepStrictEqual(result.interfaces.associate, []);
                });
        });

        it('reject when _discoverNetworkInterfaceAddress fails', () => {
            const addresses = { localAddresses: ['10.0.0.1'] };
            const definitions = [{ type: 'networkInterfaceAddress', scopingAddress: '10.0.0.2' }];
            provider._listNics = sinon.stub().rejects(new Error('nic-list-error'));

            return provider.discoverAddressOperationsUsingDefinitions(addresses, definitions, {})
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'nic-list-error');
                });
        });
    });

    describe('_discoverAddressOperations should', () => {
        it('return empty operations when no local addresses', () => provider._discoverAddressOperations([], ['10.0.0.1'])
            .then((result) => {
                assert.deepStrictEqual(result.publicAddresses, []);
                assert.deepStrictEqual(result.interfaces.disassociate, []);
            }));

        it('return empty operations when no failover addresses', () => provider._discoverAddressOperations(['10.0.0.1'], [])
            .then((result) => {
                assert.deepStrictEqual(result.publicAddresses, []);
            }));

        it('return empty operations when both are null', () => provider._discoverAddressOperations(null, null)
            .then((result) => {
                assert.deepStrictEqual(result.publicAddresses, []);
            }));

        it('reject when _listNics fails', () => {
            provider._listNics = sinon.stub().rejects(new Error('list-nics-error'));

            return provider._discoverAddressOperations(['1.1.1.1'], ['2.2.2.2'])
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'list-nics-error');
                });
        });
    });

    describe('_updateAddresses should', () => {
        it('log info and resolve when operations have interfaces', () => {
            sinon.stub(provider, '_reassociateAddresses').resolves();

            return provider._updateAddresses({
                interfaces: {
                    disassociate: [['rg', 'nic1', {}, 'Disassociate']],
                    associate: [['rg', 'nic2', {}, 'Associate']]
                }
            })
                .then(() => {
                    assert.ok(provider.logger.info.calledWith('Addresses reassociated successfully'));
                });
        });

        it('reject when _reassociateAddresses fails', () => {
            sinon.stub(provider, '_reassociateAddresses').rejects(new Error('reassociate-error'));

            return provider._updateAddresses({
                interfaces: {
                    disassociate: [['rg', 'nic1', {}, 'Disassociate']],
                    associate: [['rg', 'nic2', {}, 'Associate']]
                }
            })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'reassociate-error');
                });
        });
    });

    describe('_reassociateAddresses should', () => {
        it('resolve when no operations provided', () => {
            sinon.stub(provider, '_retrier').callsFake((fn, args) => fn.apply(provider, args));
            return provider._reassociateAddresses({})
                .then(() => {
                    assert.ok(true);
                });
        });

        it('resolve when disassociate is empty', () => {
            sinon.stub(provider, '_retrier').callsFake((fn, args) => fn.apply(provider, args));
            return provider._reassociateAddresses({ disassociate: [], associate: [] })
                .then(() => {
                    assert.ok(true);
                });
        });

        it('reject when _updateNic fails during disassociate', () => {
            sinon.stub(provider, '_retrier').callsFake((fn, args) => fn.apply(provider, args));
            sinon.stub(provider, '_updateNic').rejects(new Error('nic-update-failed'));

            return provider._reassociateAddresses({
                disassociate: [['rg', 'nic1', {}, 'Disassociate']],
                associate: [['rg', 'nic2', {}, 'Associate']]
            })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'nic-update-failed');
                });
        });
    });

    describe('_parseNics should', () => {
        it('log error when nic provisioningState is not Succeeded', () => {
            const nics = [
                {
                    id: 'nic01',
                    properties: {
                        provisioningState: 'Failed',
                        ipConfigurations: [
                            { properties: { privateIPAddress: '1.1.1.1' } }
                        ]
                    }
                }
            ];
            const result = provider._parseNics(nics, ['1.1.1.1'], []);
            assert.ok(provider.logger.error.calledWith('Unexpected provisioning state: Failed'));
            assert.strictEqual(result.mine.length, 1);
        });

        it('not add duplicate nics to mine or theirs arrays', () => {
            const nics = [
                {
                    id: 'nic01',
                    properties: {
                        provisioningState: 'Succeeded',
                        ipConfigurations: [
                            { properties: { privateIPAddress: '1.1.1.1' } },
                            { properties: { privateIPAddress: '1.1.1.2' } }
                        ]
                    }
                }
            ];
            const result = provider._parseNics(nics, ['1.1.1.1', '1.1.1.2'], []);
            assert.strictEqual(result.mine.length, 1);
        });

        it('remove nics from theirs if also in mine', () => {
            const nics = [
                {
                    id: 'nic01',
                    properties: {
                        provisioningState: 'Succeeded',
                        ipConfigurations: [
                            { properties: { privateIPAddress: '1.1.1.1' } },
                            { properties: { privateIPAddress: '2.2.2.2' } }
                        ]
                    }
                }
            ];
            const result = provider._parseNics(nics, ['1.1.1.1'], ['2.2.2.2']);
            assert.strictEqual(result.mine.length, 1);
            assert.strictEqual(result.theirs.length, 0);
        });
    });

    describe('_initStorageAccountContainer should', () => {
        it('resolve when containers list is empty (null)', () => {
            const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
            <EnumerationResults ServiceEndpoint="https://mysa.blob.core.windows.net">
              <Containers>
              </Containers>
            </EnumerationResults>`;

            provider._makeRequest = sinon.stub()
                .onFirstCall().resolves(xmlResponse)
                .onSecondCall()
                .resolves();

            return provider._initStorageAccountContainer()
                .then(() => {
                    assert.strictEqual(provider._makeRequest.callCount, 2);
                });
        });
    });

    describe('_generateNetworkInterfaceOperations should', () => {
        it('warn and return empty when parsedNics mine is empty', () => {
            provider._listNics = sinon.stub().resolves([
                {
                    id: 'nic01',
                    name: 'nic01',
                    properties: {
                        provisioningState: 'Succeeded',
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '3.3.3.3',
                                    subnet: { id: 'subnet-1' }
                                }
                            }
                        ]
                    },
                    tags: { f5_cloud_failover_label: 'test', f5_cloud_failover_nic_map: 'ext' }
                }
            ]);

            const addresses = { localAddresses: ['9.9.9.9'] };
            const definitions = [{ scopingAddress: '10.0.0.1' }];

            return provider._generateNetworkInterfaceOperations(addresses, definitions)
                .then((result) => {
                    assert.ok(provider.logger.warning.calledWith('Problem with discovering network interfaces parsedNics'));
                    assert.deepStrictEqual(result.interfaces.disassociate, []);
                    assert.deepStrictEqual(result.interfaces.associate, []);
                });
        });

        it('warn when subnet ID is undefined for a NIC pair', () => {
            provider._listNics = sinon.stub().resolves([
                {
                    id: 'nic01',
                    name: 'nic01',
                    properties: {
                        provisioningState: 'Succeeded',
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '10.0.0.2',
                                    subnet: { id: undefined }
                                }
                            }
                        ]
                    },
                    tags: { f5_cloud_failover_label: 'test', f5_cloud_failover_nic_map: 'ext' }
                },
                {
                    id: 'nic02',
                    name: 'nic02',
                    properties: {
                        provisioningState: 'Succeeded',
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '10.0.0.1',
                                    subnet: { id: 'subnet-1' }
                                }
                            }
                        ]
                    },
                    tags: { f5_cloud_failover_label: 'test', f5_cloud_failover_nic_map: 'ext' }
                }
            ]);

            const addresses = { localAddresses: ['10.0.0.1'] };
            const definitions = [{ scopingAddress: '10.0.0.2' }];

            return provider._generateNetworkInterfaceOperations(addresses, definitions)
                .then(() => {
                    assert.ok(provider.logger.warning.calledWith('Subnet ID values do not match or do not exist for a interface'));
                });
        });

        it('reject when _listNics fails', () => {
            provider._listNics = sinon.stub().rejects(new Error('nic-error'));

            const addresses = { localAddresses: ['10.0.0.1'] };
            const definitions = [{ scopingAddress: '10.0.0.2' }];

            return provider._generateNetworkInterfaceOperations(addresses, definitions)
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'nic-error');
                });
        });
    });

    describe('_getPublicIpAddress error path', () => {
        it('should reject when _makeRequest fails', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider.resourceToken = 'foo';
            provider.storageToken = 'bar';
            provider._makeRequest = sinon.stub().rejects(new Error('pip-api-error'));

            return provider._getPublicIpAddress({ publicIpAddress: 'test-pip' })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'pip-api-error');
                });
        });
    });

    describe('_getRouteTableConfig error path', () => {
        it('should reject when _makeRequest fails', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider._makeRequest = sinon.stub().rejects(new Error('config-error'));

            return provider._getRouteTableConfig('rg01', 'rt01', `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'config-error');
                });
        });
    });

    describe('_updateRouteTable should', () => {
        it('update route table and return response', () => {
            const routeConfig = {
                name: 'rt01',
                properties: { routes: [] }
            };
            provider._makeRequest = sinon.stub().resolves(routeConfig);

            return provider._updateRouteTable('rg01', 'rt01', routeConfig, `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then((response) => {
                    assert.strictEqual(response.name, 'rt01');
                    assert.ok(provider.logger.info.calledWith('_updateRouteTable successful.'));
                });
        });

        it('reject when _makeRequest fails', () => {
            provider._makeRequest = sinon.stub().rejects(new Error('update-rt-error'));

            return provider._updateRouteTable('rg01', 'rt01', {}, `/subscriptions/${mockSubscriptionId}/resourceGroups/rg01/id_rt01`)
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'update-rt-error');
                });
        });
    });

    describe('_parseResourceId should', () => {
        it('extract subscriptionId from resource string', () => {
            const result = provider._parseResourceId('/subscriptions/my-sub-id/resourceGroups/rg01/providers/Microsoft.Network/routeTables/rt01');
            assert.strictEqual(result.subscriptionId, 'my-sub-id');
        });
    });

    describe('_createResourceID should', () => {
        it('return name directly when name contains /subscriptions/', () => {
            provider.primarySubscriptionId = 'sub-id';
            provider.resourceGroup = 'rg01';
            const result = provider._createResourceID({
                provider: 'Microsoft.Network',
                name: '/subscriptions/other-sub/resourceGroups/rg02/providers/Microsoft.Network/nic01'
            });
            assert.ok(result.startsWith('/subscriptions/other-sub'));
        });

        it('return name when no provider specified', () => {
            const result = provider._createResourceID({ name: 'some-name' });
            assert.strictEqual(result, 'some-name');
        });

        it('return name when options is empty', () => {
            const result = provider._createResourceID({});
            assert.strictEqual(result, undefined);
        });
    });

    describe('_discoverRoutesUsingNextHopAddress should', () => {
        it('return inspection data with networkId when subnets exist', () => {
            const routeTables = [
                {
                    id: '/foo/foo/foo/rg01/id_rt01',
                    name: 'rt01',
                    tags: { F5_SELF_IPS: '1.1.1.1,2.2.2.2' },
                    properties: {
                        routes: [
                            {
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.0.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '1.1.1.1'
                                }
                            }
                        ],
                        subnets: [{ id: '/foo/subnets/internal' }]
                    }
                }
            ];
            const routeGroup = {
                routeAddressRanges: [
                    {
                        routeAddresses: ['192.0.0.0/24'],
                        routeNextHopAddresses: { type: 'routeTag', tag: 'F5_SELF_IPS' }
                    }
                ]
            };

            const result = provider._discoverRoutesUsingNextHopAddress(
                routeTables, routeGroup, ['1.1.1.1'], true
            );
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].networkId, '/foo/subnets/internal');
        });

        it('return inspection data with empty networkId when no subnets', () => {
            const routeTables = [
                {
                    id: '/foo/foo/foo/rg01/id_rt01',
                    name: 'rt01',
                    tags: { F5_SELF_IPS: '1.1.1.1,2.2.2.2' },
                    properties: {
                        routes: [
                            {
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.0.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '1.1.1.1'
                                }
                            }
                        ]
                    }
                }
            ];
            const routeGroup = {
                routeAddressRanges: [
                    {
                        routeAddresses: ['192.0.0.0/24'],
                        routeNextHopAddresses: { type: 'routeTag', tag: 'F5_SELF_IPS' }
                    }
                ]
            };

            const result = provider._discoverRoutesUsingNextHopAddress(
                routeTables, routeGroup, ['1.1.1.1'], true
            );
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].networkId, '');
        });

        it('not return data when getLocalRoutes is false and next hop matches', () => {
            const routeTables = [
                {
                    id: '/foo/foo/foo/rg01/id_rt01',
                    name: 'rt01',
                    tags: { F5_SELF_IPS: '1.1.1.1,2.2.2.2' },
                    properties: {
                        routes: [
                            {
                                name: 'route01',
                                properties: {
                                    addressPrefix: '192.0.0.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '1.1.1.1'
                                }
                            }
                        ]
                    }
                }
            ];
            const routeGroup = {
                routeAddressRanges: [
                    {
                        routeAddresses: ['192.0.0.0/24'],
                        routeNextHopAddresses: { type: 'routeTag', tag: 'F5_SELF_IPS' }
                    }
                ]
            };

            const result = provider._discoverRoutesUsingNextHopAddress(
                routeTables, routeGroup, ['1.1.1.1'], false
            );
            assert.strictEqual(result.length, 0);
        });
    });

    describe('_discoverStorageAccount should', () => {
        it('return storageName directly when already set', () => {
            provider.storageName = 'existing-sa';
            provider._listStorageAccounts = sinon.stub().rejects(new Error('should not be called'));
            return provider._discoverStorageAccount()
                .then((result) => {
                    assert.strictEqual(result, 'existing-sa');
                    assert.strictEqual(provider._listStorageAccounts.called, false);
                });
        });

        it('reject when _listStorageAccounts fails', () => {
            provider.storageName = null;
            provider._listStorageAccounts = sinon.stub().rejects(new Error('sa-error'));

            return provider._discoverStorageAccount()
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'sa-error');
                });
        });
    });

    describe('_listStorageAccounts should', () => {
        it('return all accounts when tags filter has zero keys', () => {
            const listResponse = {
                value: [
                    { name: 'sa01', tags: { foo: 'bar' } },
                    { name: 'sa02', tags: {} }
                ]
            };
            provider._makeRequest = sinon.stub().resolves(listResponse);

            return provider._listStorageAccounts({ tags: null })
                .then((result) => {
                    assert.deepStrictEqual(result, listResponse.value);
                });
        });

        it('reject when _makeRequest fails', () => {
            provider._makeRequest = sinon.stub().rejects(new Error('storage-error'));

            return provider._listStorageAccounts()
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'storage-error');
                });
        });
    });

    describe('_listNics should', () => {
        it('return all NICs when no tags filter', () => {
            const nicResponse = {
                value: [
                    { id: 'nic01', name: 'nic01' },
                    { id: 'nic02', name: 'nic02' }
                ]
            };
            provider._makeRequest = sinon.stub().resolves(nicResponse);

            return provider._listNics({ tags: null })
                .then((result) => {
                    assert.deepStrictEqual(result, nicResponse.value);
                });
        });
    });

    describe('getAssociatedAddressAndRouteInfo should', () => {
        it('handle NIC with no publicIPAddress', () => {
            const mockInstanceMetadata = {
                compute: { vmId: 'vm-1', name: 'test-vm' }
            };
            const mockNicData = [
                {
                    id: '/some-path/nic/id',
                    properties: {
                        virtualMachine: { id: 'test-vm' },
                        ipConfigurations: [
                            {
                                properties: {
                                    privateIPAddress: '1.1.1.1'
                                }
                            }
                        ]
                    }
                }
            ];
            provider._getInstanceMetadata = sinon.stub().resolves(mockInstanceMetadata);
            provider._listNics = sinon.stub().resolves(mockNicData);
            provider.routeGroupDefinitions = [];

            return provider.getAssociatedAddressAndRouteInfo(true, false)
                .then((data) => {
                    assert.strictEqual(data.addresses.length, 1);
                    assert.strictEqual(data.addresses[0].publicIpAddress, '');
                    assert.strictEqual(data.addresses[0].privateIpAddress, '1.1.1.1');
                });
        });

        it('reject when _getInstanceMetadata fails', () => {
            provider._getInstanceMetadata = sinon.stub().rejects(new Error('metadata-error'));

            return provider.getAssociatedAddressAndRouteInfo(true, true)
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'metadata-error');
                });
        });
    });

    describe('_filterLocalAddresses should', () => {
        it('filter IPv4 addresses for IPv4 route prefix', () => {
            const result = provider._filterLocalAddresses('192.0.0.0/24', ['10.0.1.1', 'not-an-ip']);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], '10.0.1.1');
        });

        it('filter IPv6 addresses for IPv6 route prefix', () => {
            const result = provider._filterLocalAddresses('ace:cab:deca:defe::/64', ['ace:cab:deca:deee::5', '10.0.1.1']);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], 'ace:cab:deca:deee::5');
        });
    });

    describe('_getNetworkInterfaceByName error path', () => {
        it('should reject when _makeRequest fails', () => {
            provider.primarySubscriptionId = mockSubscriptionId;
            provider._makeRequest = sinon.stub().rejects(new Error('nic-api-error'));

            return provider._getNetworkInterfaceByName('nic01')
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'nic-api-error');
                });
        });
    });

    describe('init with proxy settings', () => {
        it('should set proxyAgent when proxy host is present', () => {
            const Device = require('../../../src/nodejs/device.js');
            sinon.restore();
            sinon.stub(Device.prototype, 'init').resolves();
            sinon.stub(Device.prototype, 'getProxySettings').resolves({
                host: 'proxy.example.com',
                port: 8080,
                protocol: 'http'
            });

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

            srcUtil.makeRequest = sinon.stub().resolves(mockMetadata);
            provider._listStorageAccounts = sinon.stub().resolves([{ name: 'foo', tags: { foo: 'bar' } }]);
            provider._initStorageAccountContainer = sinon.stub().resolves();

            return provider.init()
                .then(() => {
                    assert.ok(provider.proxyAgent);
                });
        });
    });
});
