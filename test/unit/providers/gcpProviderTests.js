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
const sinon = require('sinon');

const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
const GoogleCloudProvider = require('../../../src/nodejs/providers/gcp/cloud.js').Cloud;
const util = require('../../shared/util.js');

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
const mockSingleZoneVms = [
    {
        name: 'testInstanceName01',
        zone: 'projects/1111/zones/us-west1-a',
        networkInterfaces: [
            {
                name: 'testNic',
                aliasIpRanges: [],
                accessConfigs: [
                    {
                        name: 'ONE_TO_ONE_NAT'
                    }
                ]
            }
        ]
    },
    {
        name: 'testInstanceName02',
        zone: 'projects/1111/zones/us-west1-a',
        networkInterfaces: [
            {
                name: 'testNic',
                aliasIpRanges: [
                    '10.0.2.1/24'
                ],
                accessConfigs: [
                    {
                        name: 'ONE_TO_ONE_NAT'
                    }
                ]
            }
        ]
    }
];
const mockMultipleZoneVms = [
    {
        name: 'testInstanceName01',
        zone: 'projects/1111/zones/us-west1-b',
        networkInterfaces: [
            {
                name: 'testNic',
                aliasIpRanges: []
            }
        ]
    },
    {
        name: 'testInstanceName02',
        zone: 'projects/1111/zones/us-west1-a',
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
const fwdRuleDescription = 'f5_cloud_failover_labels={"f5_target_instance_pair":"testInstanceName01, testInstanceName02"}';

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
        provider.logger.error = sinon.stub();
        provider.logger.warning = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.verbose = sinon.stub();
        provider.logger.silly = sinon.stub();

        provider.tags = {
            'test-tag-key': 'test-tag-value'
        };
        provider.routeTags = {
            'test-tag-key': 'test-tag-value'
        };
        provider.routeNextHopAddresses = {
            type: 'routeTag',
            tag: 'f5_self_ips'
        };
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

    describe('updateAddresses should', () => {
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1', '2.2.2.2'];

        let getVmsByTagsStub;
        let getFwdRulesStub;
        let getTargetInstancesStub;

        function validateAliasIpOperations(spy, options) {
            options = options || {};
            const expectedZone = options.zone || 'us-west1-b';

            assert.deepEqual(spy.args[0][0], 'testInstanceName02');
            assert.deepEqual(spy.args[0][2].aliasIpRanges, []);
            assert.deepEqual(spy.args[1][0], 'testInstanceName01');
            assert.deepEqual(spy.args[1][2].aliasIpRanges, ['10.0.2.1/24']);
            assert.deepEqual(spy.args[1][3].zone, expectedZone);
        }

        function validateFwdRuleOperations(spy) {
            assert.deepEqual(spy.args[0][0][0][0], 'testFwdRule');
            assert.deepEqual(spy.args[0][0][0][1], 'selfLink/testInstanceName01');
        }

        beforeEach(() => {
            getVmsByTagsStub = sinon.stub(provider, '_getVmsByTags').resolves(util.deepCopy(mockMultipleZoneVms));
            getFwdRulesStub = sinon.stub(provider, '_getFwdRules').resolves([
                {
                    name: 'testFwdRule',
                    IPAddress: '2.2.2.2',
                    target: 'compute/testInstanceName02'
                }
            ]);
            getTargetInstancesStub = sinon.stub(provider, '_getTargetInstances').resolves([
                {
                    name: 'testInstanceName01',
                    instance: 'compute/testInstanceName01',
                    selfLink: 'selfLink/testInstanceName01'
                }
            ]);

            provider.instanceName = 'testInstanceName01';
        });

        it('should validate method does not throw error if update operations is empty', () => {
            return provider.updateAddresses({ updateOperations: {} })
                .catch(err => Promise.reject(err));
        });

        it('validate address failover', () => {
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            const updateFwdRulesSpy = sinon.stub(provider, '_updateFwdRules').resolves();

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                    validateFwdRuleOperations(updateFwdRulesSpy);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate address failover with forwarding rules provided via label', () => {
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            const updateFwdRulesSpy = sinon.stub(provider, '_updateFwdRules').resolves();

            getFwdRulesStub.resolves([
                {
                    name: 'testFwdRule',
                    description: fwdRuleDescription,
                    IPAddress: '2.2.2.2',
                    target: 'compute/testInstanceName02'
                }
            ]);

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                    validateFwdRuleOperations(updateFwdRulesSpy);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate alias IP failover (without any fwd rules or target instances)', () => {
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();

            getFwdRulesStub.resolves([]);
            getTargetInstancesStub.resolves(null);

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate alias IP failover (with unrelated fwd rule and no target instances)', () => {
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();

            getFwdRulesStub.resolves([
                {
                    name: 'randomFwdRule',
                    IPAddress: '3.3.3.3',
                    target: 'compute/randomTestInstance'
                }
            ]);
            getTargetInstancesStub.resolves(null);

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate fwd rule failover (without any alias IPs)', () => {
            const updateFwdRulesSpy = sinon.stub(provider, '_updateFwdRules').resolves();

            getVmsByTagsStub.resolves([
                {
                    name: 'testInstanceName01',
                    zone: 'projects/1111/zones/us-west1-a',
                    networkInterfaces: [
                        {
                            name: 'testNic',
                            aliasIpRanges: []
                        }
                    ]
                },
                {
                    name: 'testInstanceName02',
                    zone: 'projects/1111/zones/us-west1-a',
                    networkInterfaces: [
                        {
                            name: 'testNic',
                            aliasIpRanges: []
                        }
                    ]
                }
            ]);

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateFwdRuleOperations(updateFwdRulesSpy);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate address failover with all instances in a single zone', () => {
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            sinon.stub(provider, '_updateFwdRules').resolves();

            getVmsByTagsStub.resolves(util.deepCopy(mockSingleZoneVms));

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy, { zone: 'us-west1-a' });
                })
                .catch(err => Promise.reject(err));
        });

        it('validate address failover does not attempt to update access configs', () => {
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            sinon.stub(provider, '_updateFwdRules').resolves();

            getVmsByTagsStub.resolves(util.deepCopy(mockSingleZoneVms));

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy, { zone: 'us-west1-a' });
                    assert.strictEqual(updateNicSpy.args[0][2].accessConfigs, undefined);
                    assert.strictEqual(updateNicSpy.args[1][2].accessConfigs, undefined);
                })
                .catch(err => Promise.reject(err));
        });

        it('validate updateAddresses method, promise rejection', () => {
            getVmsByTagsStub.rejects(new Error('rejection'));

            return provider.updateAddresses({ localAddresses, failoverAddresses, discoverOnly: true })
                .then(operations => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    assert.ok(false, 'Expected an error');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('updateRoutes should', () => {
        const localAddresses = ['1.1.1.1', '2.2.2.2'];

        let providerSendRequestMock;

        beforeEach(() => {
            const getRoutesResponse = [
                {
                    kind: 'test-route',
                    description,
                    id: 'some-test-id',
                    creationTimestamp: '101010101010',
                    selfLink: 'https://test-self-link',
                    nextHopIp: '1.1.1.2',
                    destRange: '192.0.0.0/24'
                },
                {
                    kind: 'test-route-2',
                    description,
                    id: 'some-test-2-id',
                    creationTimestamp: '101010101010',
                    selfLink: 'https://test-self-2-link',
                    nextHopIp: '1.1.1.4',
                    destRange: '192.0.0.1/24'
                }
            ];
            sinon.stub(provider, '_getRoutes').resolves(getRoutesResponse);

            providerSendRequestMock = sinon.stub(provider, '_sendRequest');
            providerSendRequestMock.onCall(0).resolves({
                name: 'test-name'
            });
            providerSendRequestMock.onCall(2).resolves();
            sinon.stub(provider.compute, 'operation').callsFake(() => {
                return {
                    promise: () => {
                        return Promise.resolve();
                    }
                };
            });

            provider.routeAddressRanges = [
                {
                    routeAddresses: ['192.0.0.0/24']
                }];
        });

        it('not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateRoutes(opts)
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: routeTag', () => {
            provider.routeAddressRanges[0].routeNextHopAddresses = {
                type: 'routeTag',
                tag: 'f5_self_ips'
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then(operations => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][2].nextHopIp, '1.1.1.1');
                })
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: static', () => {
            provider.routeAddressRanges[0].routeNextHopAddresses = {
                type: 'static',
                items: ['1.1.1.1', '2.2.2.2']
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then(operations => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][2].nextHopIp, '1.1.1.1');
                })
                .catch(err => Promise.reject(err));
        });

        it('update multiple routes using next hop discovery method', () => {
            provider.routeAddressRanges = [
                {
                    routeAddresses: ['192.0.0.0/24'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['1.1.1.1', '2.2.2.2']
                    }
                },
                {
                    routeAddresses: ['192.0.0.1/24'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['1.1.1.1', '2.2.2.2']
                    }
                }
            ];
            providerSendRequestMock.onCall(1).resolves({
                name: 'test-name-2'
            });
            providerSendRequestMock.onCall(3).resolves();
            providerSendRequestMock.onCall(4).resolves();

            return provider.updateRoutes({ localAddresses: ['1.1.1.1', '2.2.2.2'], discoverOnly: true })
                .then(operations => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][2].nextHopIp, '1.1.1.1');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][2].nextHopIp, '1.1.1.1');
                })
                .catch(err => Promise.reject(err));
        });
    });


    it('validate _getRoutes method execution', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes/');

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

    it('validate _getRoutes method execution with page token', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes/');

            return Promise.resolve({
                name: 'test-name',
                items: [
                    {
                        name: 'notOurRoute'
                    }
                ],
                nextPageToken: 'token'
            });
        });

        providerSendRequestMock.onCall(1).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes?pageToken=token');

            return Promise.resolve({
                name: 'test-name',
                items: [
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
            assert.strictEqual(path, 'global/routes/');

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
            assert.strictEqual(path, 'global/routes/');

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
            assert.strictEqual(path, 'global/routes/');

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
                assert.strictEqual(error.message, 'VM status is in failOnStatusCodes');
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
                assert.strictEqual(data[0], 'test_data');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate _getFwdRules returned promise even with pageTokens', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        provider.region = 'region';
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'regions/region/forwardingRules');

            return Promise.resolve({
                items: 'test_data',
                nextPageToken: 'token'
            });
        });
        providerSendRequestMock.onCall(1).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'regions/region/forwardingRules?pageToken=token');

            return Promise.resolve({
                items: 'test_data2'
            });
        });
        return provider._getFwdRules()
            .then((data) => {
                assert.strictEqual(data[0], 'test_data');
                assert.strictEqual(data[1], 'test_data2');
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
        provider.compute.getVMs = sinon.stub().resolves([[{ kind: 'vmsData', name: 'test-vm', metadata: { labels: provider.tags, zone: 'projects/1111/zones/us-west1-a' } }]]);
        provider._getVmInfo = sinon.stub().resolves('test_data');

        return provider._getVmsByTags(provider.tags)
            .then((data) => {
                assert.strictEqual(data[0], 'test_data');
            });
    });

    it('validate _getVmsByTags with extra tags', () => {
        provider.compute = sinon.stub();
        provider.compute.getVMs = sinon.stub().resolves([[{ kind: 'vmsData', name: 'test-vm', metadata: { labels: { 'test-label-1': 'test-value-1', 'missing-label': 'missing-label-value' }, zone: 'projects/1111/zones/us-west1-a' } }]]);
        provider._getVmInfo = sinon.stub().resolves('test_data');

        return provider._getVmsByTags(provider.tags)
            .then((data) => {
                assert.ok(data.length === 1);
                assert.strictEqual(data[0], 'test_data');
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
        let expectedData;

        beforeEach(() => {
            expectedData = {
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
            sinon.replace(provider, '_getVmsByTags', sinon.fake.resolves([{
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
            }]));
        });

        it('validate return addresses and routes for active device', () => {
            expectedData.routes.push({
                routeTableId: '123',
                routeTableName: 'x',
                networkId: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x'
            });
            return provider.init(testPayload)
                .then(() => {
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
                .catch(err => Promise.reject(new Error(`${err.stack}`)));
        });

        it('validate return addresses and not routes for standby device', () => {
            return provider.init(testPayload)
                .then(() => {
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
