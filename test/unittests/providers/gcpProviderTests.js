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
                    assert.ok(true);
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

    it('validate updateAddresses method', () => {
        assert.strictEqual(typeof provider.updateAddresses, 'function');
        sinon.stub(provider, '_updateFwdRules').callsFake((fwdRules, targetInstances, failoverIpAddresses) => {
            assert.strictEqual(failoverIpAddresses[0], '10.0.2.1');
            assert.strictEqual(targetInstances[0].name, 'testTargetInstance');
            assert.strictEqual(fwdRules[0].name, 'testFwrRule');
            return Promise.resolve();
        });

        const updateNicSpy = sinon.stub().resolves();
        sinon.replace(provider, '_updateNic', updateNicSpy);
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];

        provider.instanceName = 'testInstanceName';
        provider.fwdRules = [{ name: 'testFwrRule' }];
        provider.targetInstances = [{ name: 'testTargetInstance' }];

        sinon.stub(provider, '_getVmsByTags').resolves(mockVms);

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

    it('validate promise rejection for updateAddresses method', () => {
        assert.strictEqual(typeof provider.updateAddresses, 'function');
        sinon.stub(provider, '_updateNic').callsFake((options) => {
            assert.strictEqual(options.localAddresses[0], '1.1.1.1');
            assert.strictEqual(options.localAddresses[1], '4.4.4.4');
            assert.strictEqual(options.failoverAddresses[0], '10.0.2.1');
            return Promise.reject();
        });

        sinon.replace(provider, '_updateNic', sinon.fake.resolves());
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];
        provider.vms = mockVms;
        provider.instanceName = 'testInstanceName';
        provider.fwdRules = [{ name: 'testFwrRule' }];
        provider.targetInstances = [{ name: 'testTargetInstance' }];

        return provider.updateAddresses({ localAddresses, failoverAddresses })
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

    it('validate _matchIps methode', () => {
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

    it('validate _updateFwdRules', () => {
        provider.instanceName = 'instance01';
        provider.computeRegion = provider.compute.region('us-west');


        sinon.stub(provider, '_updateFwdRule').callsFake((target) => {
            assert.strictEqual(target, 'item01');
            return Promise.resolve();
        });

        return provider._updateFwdRules({
            name: 'test-fwrdRule',
            items: [{ name: 'item01', IPAddress: '10.0.2.1', target: 'target01' },
                { name: 'item02', IPAddress: '10.0.2.2', target: 'target02' }]
        },
        {
            name: 'test-target-instances',
            items: [{ name: 'instance01', instance: 'instance01', selfLink: 'urn:none' },
                { name: 'instance02', instance: 'instance02', selfLink: 'urn:none' }]
        }, ['10.0.2.1'])
            .then(() => {
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _updateFwdRules promise rejection when unable locate targetInstance', () => {
        provider.instanceName = 'instance01';
        provider.computeRegion = provider.compute.region('us-west');


        sinon.stub(provider, '_updateFwdRule').callsFake((target) => {
            assert.strictEqual(target, 'item01');
            return Promise.resolve();
        });

        return provider._updateFwdRules({
            name: 'test-fwrdRule',
            items: [{ name: 'item01', IPAddress: '10.0.2.1', target: 'target01' },
                { name: 'item02', IPAddress: '10.0.2.2', target: 'target02' }]
        },
        {
            name: 'test-target-instances',
            items: [{ name: 'instance03', instance: 'instance03', selfLink: 'urn:none' },
                { name: 'instance02', instance: 'instance02', selfLink: 'urn:none' }]
        }, ['10.0.2.1'])
            .then(() => {
                assert.ok(false);
            })
            .catch((err) => {
                assert.strictEqual('Unable to locate our target instance: instance01', err.message);
            });
    });


    it('validate promise rejection for _updateFwdRules due to missing failover ip', () => {
        provider.instanceName = 'instance01';
        provider.computeRegion = provider.compute.region('us-west');

        return provider._updateFwdRules({
            name: 'test-fwrdRule',
            items: [{ name: 'item01', IPAddress: '10.0.2.1', target: 'target01' },
                { name: 'item02', IPAddress: '10.0.2.2', target: 'target02' }]
        },
        {
            name: 'test-target-instances',
            items: []
        }, [])
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate promise rejection for _updateFwdRules due to missing target instance', () => {
        provider.instanceName = 'instance01';
        provider.computeRegion = provider.compute.region('us-west');


        return provider._updateFwdRules({
            name: 'test-fwrdRule',
            items: [{ name: 'item01', IPAddress: '10.0.2.1', target: 'target01' },
                { name: 'item02', IPAddress: '10.0.2.2', target: 'target02' }]
        },
        { name: 'test-target-instances', items: [] }, ['10.0.2.1'])
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });


    it('validate promise resolve for _getTargetInstances', () => {
        sinon.replace(provider, '_sendRequest', sinon.fake.resolves('test_data'));

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
                assert.ok(true);
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
                assert.ok(true);
                assert.strictEqual(error.message, 'test_error');
            });
    });

    it('validate _getFwdRules returned promise', () => {
        sinon.replace(provider, '_sendRequest', sinon.fake.resolves('test_data'));

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

    /* eslint-disable arrow-body-style */
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
        const createReadStreamReturn = sinon.stub().returns(returnObject);

        const existsReturn = sinon.stub().resolves([true]);

        provider.bucket.file = sinon.stub().returns({
            createReadStream: createReadStreamReturn,
            exists: existsReturn
        });
        return provider.downloadDataFromStorage(fileName)
            .then((data) => {
                assert.strictEqual(data.status, payload.status);
            })
            .catch(err => Promise.reject(err));
    });
});
