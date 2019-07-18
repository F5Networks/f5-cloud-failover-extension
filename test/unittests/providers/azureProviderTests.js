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
    let cloudLibsUtil;

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
        cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
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
        const provider = new AzureCloudProvider(mockMetadata);

        assert.strictEqual(provider.environment, cloud);
    });


    it('should initialize azure provider', () => {
        const provider = new AzureCloudProvider(mockMetadata);

        sinon.replace(f5CloudLibs.util, 'getDataFromUrl', sinon.fake.resolves(mockMetadata));

        return provider.init()
            .then(() => {
                assert.strictEqual(provider.resourceGroup, mockResourceGroup);
                assert.strictEqual(provider.subscriptionId, mockSubscriptionId);
            })
            .catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });

    it('validate _getInstanceMetadata with promise rejection', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        cloudLibsUtil.getDataFromUrl = sinon.stub().rejects();

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

    it('validate updateAddresses with resolved promise', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        provider.logger = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.silly = sinon.stub();

        const _getNicConfigSpy = sinon.spy(provider, '_getNicConfig');
        const localAddresses = ['1.1.1.1', '4.4.4.4', '5.5.5.5'];
        const failoverAddresses = ['2.2.2.2', '3.3.3.3', '5.5.5.5'];
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
            tags: 'tagsNic01'
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
            tags: 'tagsNic02'
        };
        const nic03 = {
            id: 'id_nic03',
            provisioningState: 'NotSucceeded',
            ipConfigurations: [
                {
                    privateIPAddress: '3.3.3.3'
                }
            ],
            name: 'nic03',
            location: 'location03',
            enableIPForwarding: true,
            networkSecurityGroup: 'nsgNic03',
            tags: 'tagsNic03'
        };


        const nic04 = {
            id: 'id_nic04',
            provisioningState: 'Succeeded',
            ipConfigurations: [
                {
                    privateIPAddress: '4.4.4.4'
                }
            ],
            name: 'nic04',
            location: 'location04',
            enableIPForwarding: true,
            networkSecurityGroup: 'nsgNic04',
            tags: 'tagsNic04'
        };

        sinon.replace(provider, '_listNics', sinon.fake.resolves([nic01, nic02, nic03, nic04]));
        sinon.stub(provider, '_updateAssociations').callsFake((disassociate, associate) => {
            assert.strictEqual(associate[0][1], 'nic04');
            assert.strictEqual(associate[0][2].enableIPForwarding, true);
            assert.strictEqual(associate[0][2].ipConfigurations[0].privateIPAddress, '4.4.4.4');
            assert.strictEqual(associate[0][2].networkSecurityGroup, 'nsgNic04');
            assert.strictEqual(associate[0][2].tags, 'tagsNic04');

            assert.strictEqual(disassociate[0][1], 'nic03');
            assert.strictEqual(disassociate[0][2].enableIPForwarding, true);
            assert.strictEqual(disassociate[0][2].location, 'location04');
            assert.strictEqual(disassociate[0][2].networkSecurityGroup, 'nsgNic03');
            assert.strictEqual(disassociate[0][2].tags, 'tagsNic03');
        });

        return provider.updateAddresses(localAddresses, failoverAddresses)
            .then(() => {
                assert.strictEqual(_getNicConfigSpy.args[0].pop().privateIPAddress, '4.4.4.4');
                assert.strictEqual(_getNicConfigSpy.args[1].pop().privateIPAddress, '3.3.3.3');
                assert.strictEqual(_getNicConfigSpy.args[2].pop().privateIPAddress, '3.3.3.3');
            })
            .catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });

    it('validate _updateNics promise callback for valid case', () => {
        const provider = new AzureCloudProvider(mockMetadata);

        provider.logger = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.info = sinon.stub();

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

        return provider._updateNics('resourceGroup01', 'nic01', nicParams, 'Dissasociate')
            .then((updateNicsResponse) => {
                assert.strictEqual(updateNicsResponse, 'some_data');
            })
            .catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });

    it('validate _updateNics promise rejection', () => {
        const provider = new AzureCloudProvider(mockMetadata);

        provider.logger = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.info = sinon.stub();

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

        return provider._updateNics('resourceGroup01', 'nic01', nicParams, 'Dissasociate')
            .then(() => {
                // fails when promise gets resolved
                assert.fail();
            })
            .catch(() => {
                // succeeds when promise is rejected
                assert.ok(true);
            });
    });

    it('validate _updateAssociations method with empty parameters', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        provider.logger = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.info = sinon.stub();

        return provider._updateAssociations(false, false)
            .then(() => {
                // verifies that promise gets resolved
                assert.ok(true);
            }).catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });

    it('validate _updateAssociations method with valid parameters', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        provider.logger = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.info = sinon.stub();

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
        sinon.stub(provider, '_updateNics').resolves();

        return provider._updateAssociations(disassociate, associate)
            .then(() => {
                // suceeds when promise gets resolved
                assert.ok(true);
            }).catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });

    it('validate _listNics with resolved promise', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        const options = {
            tags: [{ key: 'tag01', value: 'value01' }]
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
            .catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });


    it('validate _listNics rejection', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        const options = {
            tags: [{ key: 'tag01', value: 'value01' }]
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

    it('validate resolve _retrier', () => {
        const provider = new AzureCloudProvider(mockMetadata);

        const fakeFunc = () => Promise.resolve();
        return provider._retrier(fakeFunc, { key01: 'value01', key02: 'value02' })
            .then(() => {
                assert.ok(true);
            })
            .catch(() => {
                // fails when error recieved
                assert.fail();
            });
    });

    it('validate reject _retrier', () => {
        const provider = new AzureCloudProvider(mockMetadata);
        cloudLibsUtil.tryUntil = sinon.stub().rejects();
        const fakeFunc = () => Promise.reject();
        return provider._retrier(fakeFunc, { key01: 'value01', key02: 'value02' })
            .then(() => {
                assert.fail();
            })
            .catch(() => {
                // fails when error recieved
                assert.ok(true);
            });
    });
});
