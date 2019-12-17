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
const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
const GoogleCloudProvider = require('../../../src/nodejs/providers/gcp/cloud.js').Cloud;

const cloud = 'gcp';
let provider;

const testPayload = {
    tags: {
        key01: 'value01'
    },
    routeTags: {
        key01: 'value01'
    }
};
const mockVms = [
    {
        name: 'testInstanceName',
        networkInterfaces: [
            {
                name: 'testNic',
                aliasIpRanges: []
            }
        ]
    },
    {
        name: 'testInstanceName02',
        networkInterfaces: [
            {
                name: 'testNic',
                aliasIpRanges: [
                    '10.0.2.1/24'
                ]
            }
        ]
    }
];
const description = 'f5_cloud_failover_labels={"test-tag-key":"test-tag-value","f5_self_ips":["1.1.1.1","1.1.1.2"]}';

describe('Provider - GCP', () => {
    const mockResourceGroup = 'foo';
    const mockSubscriptionId = 'foo';
    const mockMetadata = {
        compute: {
            resourceGroupName: mockResourceGroup,
            subscriptionId: mockSubscriptionId,
            gcpEnvironment: 'GooglePublicCloud'
        }
    };

    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    beforeEach(() => {
        provider = new GoogleCloudProvider(mockMetadata);
        provider.logger = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.silly = sinon.stub();
        provider.logger.warn = sinon.stub();

        provider.tags = {
            'test-tag-key': 'test-tag-value'
        };
        provider.routeTags = {
            'test-tag-key': 'test-tag-value'
        };
        provider.routeSelfIpsTag = 'f5_self_ips';
        /* eslint-disable arrow-body-style */
        provider.computeZone = {
            operation: () => {
                return {
                    promise: () => Promise.resolve()
                };
            }
        };
    });
    afterEach(() => {
        sinon.restore();
    });

    it('validate constructor', () => {
        assert.strictEqual(provider.environment, cloud);
    });

    it('validate init method', () => {
        assert.strictEqual(typeof provider.init, 'function');

        sinon.replace(provider, '_getLocalMetadata', sinon.fake.resolves('GoogleInstanceName'));
        sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
        sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwrResponse'));
        sinon.replace(provider, '_getVmsByTags', sinon.fake.resolves('vmsTagResponse'));
        sinon.replace(provider, '_getBucketFromLabel', sinon.fake.resolves('bucketResponse'));

        return provider.init(testPayload)
            .then(() => {
                assert.strictEqual(provider.fwdRules, 'fwrResponse');
                assert.strictEqual(provider.instanceName, 'GoogleInstanceName');
                assert.strictEqual(provider.targetInstances, 'targetInstanceResponse');
                assert.strictEqual(provider.bucket, 'bucketResponse');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate promise rejection for init method', () => {
        assert.strictEqual(typeof provider.init, 'function');


        sinon.replace(provider, '_getLocalMetadata', sinon.fake.resolves('GoogleInstanceName'));
        sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
        sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwrResponse'));
        sinon.replace(provider, '_getBucketFromLabel', sinon.fake.resolves('bucketResponse'));
        sinon.replace(provider, '_getVmsByTags', sinon.fake.rejects('test-error'));

        return provider.init(testPayload)
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'test-error');
                assert.ok(true);
            });
    });

    it('validate uploadDataToStorage', () => {
        const fileName = 'test.json';
        const payload = { status: 'progress' };
        provider.bucket = payload;
        provider.bucket.file = (name) => {
            return {
                fileName: name,
                save: (data) => {
                    if (data.toString().length > 0) {
                        assert.strictEqual(JSON.parse(data).status, payload.status);
                        return Promise.resolve(data);
                    }
                    return Promise.resolve();
                }
            };
        };

        return provider.uploadDataToStorage(fileName, payload)
            .then((data) => {
                assert.strictEqual(JSON.parse(data).status, payload.status);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate downloadDataFromStorage', () => {
        const fileName = 'test.json';
        const payload = { status: 'progress' };
        provider.bucket = payload;

        const returnObject = sinon.stub();
        returnObject.on = sinon.stub();
        returnObject.on.withArgs('data').yields(JSON.stringify(payload));
        returnObject.on.withArgs('end').yields(null);

        const createReadStreamSpy = sinon.stub().returns(returnObject);
        const existsSpy = sinon.stub().resolves([true]);

        provider.bucket.file = sinon.stub().returns({
            createReadStream: createReadStreamSpy,
            exists: existsSpy
        });
        return provider.downloadDataFromStorage(fileName)
            .then((data) => {
                assert.strictEqual(data.status, payload.status);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate updateAddresses method', () => {
        sinon.stub(provider, '_getVmsByTags').resolves(mockVms);
        sinon.stub(provider, '_getFwdRules').resolves([{ name: 'testFwdRule', IPAddress: '2.2.2.2' }]);
        sinon.stub(provider, '_getTargetInstances').resolves([{ instance: 'compute/testInstanceName' }]);

        const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();

        provider.instanceName = 'testInstanceName';

        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];

        return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
            .then(operations => provider.updateAddresses({ updateOperations: operations }))
            .then(() => {
                assert.deepEqual(updateNicSpy.args[0][0], 'testInstanceName02');
                assert.deepEqual(updateNicSpy.args[0][2].aliasIpRanges, []);
                assert.deepEqual(updateNicSpy.args[1][0], 'testInstanceName');
                assert.deepEqual(updateNicSpy.args[1][2].aliasIpRanges, ['10.0.2.1/24']);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate updateAddresses method, promise rejection', () => {
        sinon.stub(provider, '_getVmsByTags').resolves(mockVms);
        sinon.stub(provider, '_getFwdRules').resolves([{ name: 'testFwdRule', IPAddress: '2.2.2.2' }]);
        sinon.stub(provider, '_getTargetInstances').resolves([{ instance: 'compute/testInstanceName' }]);

        sinon.stub(provider, '_updateNic').rejects(new Error('rejection'));

        provider.instanceName = 'testInstanceName';

        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];

        return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
            .then(operations => provider.updateAddresses({ updateOperations: operations }))
            .then(() => {
                assert.ok(false, 'Expected an error');
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate updateRoute method', () => {
        const localAddresses = ['1.1.1.1', '2.2.2.2'];
        const getRoutesResponse = [
            {
                kind: 'test-route',
                description,
                id: 'some-test-id',
                creationTimestamp: '101010101010',
                selfLink: 'https://test-self-link',
                nextHopIp: '1.1.1.2',
                destRange: '192.0.0.0/24'
            }
        ];
        sinon.stub(provider, '_getRoutes').resolves(getRoutesResponse);

        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'DELETE');
            assert.strictEqual(path, 'global/routes/some-test-id');

            return Promise.resolve({
                name: 'test-name'
            });
        });
        providerSendRequestMock.onCall(2).callsFake((method, path, payload) => {
            assert.strictEqual(method, 'POST');
            assert.strictEqual(path, 'global/routes/');
            assert.strictEqual(payload.nextHopIp, '1.1.1.1');
            assert.strictEqual(payload.description, description);
            return Promise.resolve();
        });
        sinon.stub(provider.compute, 'operation').callsFake((name) => {
            assert.strictEqual(name, 'test-name');
            return {
                promise: () => {
                    return Promise.resolve();
                }
            };
        });

        provider.routeAddresses = ['192.0.0.0/24'];

        return provider.updateRoutes({ localAddresses, discoverOnly: true })
            .then(operations => provider.updateRoutes({ updateOperations: operations }))
            .then(() => {
                assert.strictEqual(provider.tags['test-tag-key'], 'test-tag-value');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _getRoutes method execution', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes');

            return Promise.resolve({
                name: 'test-name',
                items: [
                    {
                        name: 'notOurRoute'
                    },
                    {
                        name: 'alsoNotOurRoute',
                        description: 'foo'
                    },
                    {
                        name: 'ourRoute',
                        description
                    }
                ]
            });
        });

        return provider._getRoutes({ tags: provider.routeTags })
            .then((data) => {
                assert.strictEqual(data[0].name, 'ourRoute');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _getRoutes method execution when routeTags do not match', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes');

            return Promise.resolve({
                name: 'test-name',
                items: [
                    {
                        description
                    }
                ]
            });
        });

        return provider._getRoutes({ tags: provider.routeTags })
            .then(() => {
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _getRoutes method execution no routes found', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes');

            return Promise.resolve({
                name: 'test-name',
                items: [
                ]
            });
        });

        return provider._getRoutes({ tags: provider.routeTags })
            .then((data) => {
                assert.ok(data.length === 0);
            })
            .catch(err => Promise.reject(err));
    });


    it('validate _getRoutes method promise rejection', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes');

            return Promise.reject();
        });

        return provider._getRoutes({ tags: provider.routeTags })
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _getLocalMetadata', () => {
        cloudLibsUtil.getDataFromUrl = sinon.stub().resolves('test-data');

        assert.strictEqual(provider.environment, cloud);
        return provider._getLocalMetadata('test-entry')
            .then((data) => {
                assert.ok(true);
                assert.strictEqual(data, 'test-data');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate promise rejection for _getLocalMetadata', () => {
        cloudLibsUtil.getDataFromUrl = sinon.stub().rejects();

        assert.strictEqual(provider.environment, cloud);
        return provider._getLocalMetadata('test-entry')
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.ok(true);
                assert.notStrictEqual(error.message, 'Error getting local metadata');
            });
    });

    it('validate _matchIps method', () => {
        assert.strictEqual(provider.environment, cloud);
        const result = provider._matchIps([{ ipCidrRange: '10.0.0.0/24' }, { ipCidrRange: '10.0.1.0/24' }], [{ address: '10.0.0.1' }]);
        assert.strictEqual(result[0].ipCidrRange, '10.0.0.0/24');
    });


    it('validate _getVmMetadata', () => {
        provider.computeZone = provider.compute.zone('us-west1-a');
        provider.computeZone = sinon.stub();
        provider.computeZone.vm = sinon.stub();
        sinon.stub(provider, '_getVmMetadata').callsFake((vmName) => {
            assert.strictEqual(vmName, 'test-vm');
            return Promise.resolve();
        });

        return provider._getVmMetadata('test-vm')
            .then(() => {
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _getVmInfo', () => {
        sinon.stub(provider, '_getVmMetadata').callsFake((vmName) => {
            assert.strictEqual(vmName, 'test-vm');
            return Promise.resolve({ status: '200' });
        });

        return provider._getVmInfo('test-vm')
            .then((data) => {
                assert.ok(true);
                assert.strictEqual(data.status, '200');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate promise rejection for _getVmInfo due to failOnStatusCodes', () => {
        sinon.stub(provider, '_getVmMetadata').resolves({ kind: 'test_data', status: ['STOPPING'] });

        return provider._getVmInfo('test-vm', { failOnStatusCodes: 'STOPPING' })
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'vm status is in failOnStatusCodes');
            });
    });

    it('validate promise resolve for _getTargetInstances', () => {
        sinon.stub(provider, '_sendRequest').resolves({ items: 'test_data' });

        return provider._getTargetInstances()
            .then((data) => {
                assert.strictEqual(data, 'test_data');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate promise rejection for _getTargetInstances', () => {
        sinon.replace(provider, '_sendRequest', sinon.fake.rejects('test_error'));

        return provider._getTargetInstances()
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual('test_error', error.message);
            });
    });

    it('validate promise rejection for _getFwdRules', () => {
        sinon.replace(provider, '_sendRequest', sinon.fake.rejects('test_error'));

        return provider._getFwdRules()
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'test_error');
            });
    });

    it('validate _getFwdRules returned promise', () => {
        sinon.replace(provider, '_sendRequest', sinon.fake.resolves({ items: 'test_data' }));

        return provider._getFwdRules()
            .then((data) => {
                assert.strictEqual(data, 'test_data');
            })
            .catch(err => Promise.reject(err));
    });

    /* eslint-disable arrow-body-style */
    it('validate _updateFwdRule method execution', () => {
        provider.computeRegion = {
            rule: () => {
                return {
                    setTarget: () => {
                        return Promise.resolve([{ name: 'test-name' }]);
                    }
                };
            },
            operation: () => {
                return {
                    promise: () => {
                        return Promise.resolve();
                    }
                };
            }
        };
        return provider._updateFwdRule()
            .then(() => {
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _updateFwdRule method promise rejection', () => {
        provider.computeRegion = {
            rule: () => {
                return {
                    setTarget: () => Promise.resolve([{ name: 'test-name' }])
                };
            },
            operation: () => {
                return {
                    promise: () => Promise.reject()
                };
            }
        };
        return provider._updateFwdRule()
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _getVmsByTags', () => {
        provider.compute = sinon.stub();
        provider.compute.getVMs = sinon.stub().resolves([[{ kind: 'vmsData', name: 'test-vm', metadata: { labels: provider.tags } }]]);
        provider._getVmInfo = sinon.stub().resolves('test_data');

        return provider._getVmsByTags(provider.tags)
            .then((data) => {
                assert.strictEqual(data[0], 'test_data');
            });
    });

    it('validate _getVmsByTags with extra tag - should return no result', () => {
        provider.compute = sinon.stub();
        provider.compute.getVMs = sinon.stub().resolves([[{ kind: 'vmsData', name: 'test-vm', metadata: { labels: { 'test-tag-key': 'test-tag-value', 'missing-label': 'missing-label-value' } } }]]);
        provider._getVmInfo = sinon.stub().resolves('test_data');

        return provider._getVmsByTags(provider.tags)
            .then((data) => {
                assert.ok(data.length === 0);
            });
    });

    it('validate _getBucketFromLabel', () => {
        const payload = [
            [
                {
                    name: 'notOurBucket',
                    getLabels: () => {
                        return Promise.resolve([{ some_key: 'some_value' }]);
                    }
                },
                {
                    name: 'ourBucket',
                    getLabels: () => {
                        return Promise.resolve([{ foo: 'bar', foo1: 'bar1' }]);
                    }
                }
            ]
        ];
        provider.storage.getBuckets = () => {
            return Promise.resolve(payload);
        };

        return provider._getBucketFromLabel({ foo: 'bar', foo1: 'bar1' })
            .then((data) => {
                assert.strictEqual(data.name, 'ourBucket');
            })
            .catch(err => Promise.reject(err));
    });

    describe('function getAssociatedAddressAndRouteInfo', () => {
        function initMockup() {
            const expectedData = {
                instance: 'i-123',
                addresses: [
                    {
                        publicIpAddress: '1.1.1.1',
                        privateIpAddress: '1.1.1.1',
                        networkInterfaceId: 'nic0'
                    }
                ],
                routes: []
            };
            sinon.replace(provider, '_getLocalMetadata', sinon.fake.returns('i-123'));
            sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
            sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwrResponse'));
            sinon.replace(provider, '_getBucketFromLabel', sinon.fake.resolves('bucketResponse'));
            return expectedData;
        }

        it('validate return addresses and routes for active device', () => {
            const expectedData = initMockup();
            expectedData.routes.push({
                routeTableId: '123',
                routeTableName: 'x',
                networkId: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x'
            });
            return provider.init(testPayload)
                .then(() => {
                    provider._getVmsByTags = sinon.stub().resolves([{
                        name: 'i-123',
                        networkInterfaces: [
                            {
                                networkIP: '1.1.1.1',
                                accessConfigs: [
                                    {
                                        natIP: '1.1.1.1'
                                    }
                                ],
                                name: 'nic0'
                            }
                        ]
                    }]);
                    provider._getRoutes = sinon.stub().resolves(([
                        {
                            id: '123',
                            name: 'x',
                            network: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x',
                            nextHopIp: '1.1.1.1'
                        }
                    ]));
                })
                .then(() => {
                    return provider.getAssociatedAddressAndRouteInfo();
                })
                .then((data) => {
                    assert.deepStrictEqual(data, expectedData);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate return addresses and not routes for standby device', () => {
            const expectedData = initMockup();
            return provider.init(testPayload)
                .then(() => {
                    provider._getVmsByTags = sinon.stub().resolves([{
                        name: 'i-123',
                        networkInterfaces: [
                            {
                                networkIP: '1.1.1.1',
                                accessConfigs: [
                                    {
                                        natIP: '1.1.1.1'
                                    }
                                ],
                                name: 'nic0'
                            }
                        ]
                    }]);
                    provider._getRoutes = sinon.stub().resolves(([]));
                })
                .then(() => {
                    return provider.getAssociatedAddressAndRouteInfo();
                })
                .then((data) => {
                    assert.deepStrictEqual(data, expectedData);
                })
                .catch(err => Promise.reject(err));
        });
    });
});
