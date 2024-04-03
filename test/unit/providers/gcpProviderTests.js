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

const cloud = 'gcp';
let provider;

const mockInitData = {
    addressTags: {
        mylabel: 'mydeployment'
    },
    addressTagsRequired: true,
    routeGroupDefinitions: [
        {
            routeTags: {
                mylabel: 'mydeployment'
            }
        }
    ]
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

const routeTableDescription = 'f5_cloud_failover_labels={"mylabel":"mydeployment","f5_self_ips":"1.1.1.1,1.1.1.2"}';
const fwdRuleDescription = 'f5_cloud_failover_labels={"mylabel":"mydeployment","f5_target_instance_pair":"testInstanceName01,testInstanceName02"}';

describe('Provider - GCP', () => {
    let GoogleCloudProvider;
    let util;
    let srcUtil;
    const mockResourceGroup = 'foo';
    const mockSubscriptionId = 'foo';
    const mockMetadata = {
        compute: {
            resourceGroupName: mockResourceGroup,
            subscriptionId: mockSubscriptionId,
            gcpEnvironment: 'GooglePublicCloud'
        }
    };

    before(() => {
        GoogleCloudProvider = require('../../../src/nodejs/providers/gcp/cloud.js').Cloud;
        util = require('../../shared/util.js');
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

        provider = new GoogleCloudProvider(mockMetadata);
        provider.logger = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.warning = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.verbose = sinon.stub();
        provider.logger.silly = sinon.stub();

        provider.maxRetries = 0;
        provider.retryInterval = 100;

        provider.addressTags = {
            'test-tag-key': 'test-tag-value'
        };
        provider.addressTagsRequired = true;
        provider.routeGroupDefinitions = [
            {
                routeTags: {
                    mylabel: 'mydeployment'
                },
                routeNextHopAddresses: {
                    type: 'routeTag',
                    tag: 'f5_self_ips'
                }
            }
        ];
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

    it('validate init method', () => {
        assert.strictEqual(typeof provider.init, 'function');

        sinon.replace(provider, '_getLocalMetadata', sinon.fake.resolves('GoogleInstanceName'));
        sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
        sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwdRuleResponse'));
        sinon.replace(provider, '_getVmsByTags', sinon.fake.resolves('vmsTagResponse'));
        sinon.replace(provider, '_getCloudStorage', sinon.fake.resolves('bucketResponse'));

        return provider.init(mockInitData)
            .then(() => {
                assert.strictEqual(provider.fwdRules, 'fwdRuleResponse');
                assert.strictEqual(provider.instanceName, 'GoogleInstanceName');
                assert.strictEqual(provider.targetInstances, 'targetInstanceResponse');
                assert.strictEqual(provider.bucket, 'bucketResponse');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate promise rejection for init method', () => {
        assert.strictEqual(typeof provider.init, 'function');

        sinon.replace(provider, '_getLocalMetadata', sinon.fake.resolves('GoogleInstanceName'));
        sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
        sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwdRuleResponse'));
        sinon.replace(provider, '_getCloudStorage', sinon.fake.resolves('bucketResponse'));
        sinon.replace(provider, '_getVmsByTags', sinon.fake.rejects('test-error'));

        return provider.init(mockInitData)
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'test-error');
                assert.ok(true);
            });
    });

    it('validate init if storageName is set then _getCloudStorage return bucket name', () => {
        assert.strictEqual(typeof provider.init, 'function');

        sinon.replace(provider, '_getLocalMetadata', sinon.fake.resolves('GoogleInstanceName'));
        sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
        sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwdRuleResponse'));
        sinon.replace(provider, '_getVmsByTags', sinon.fake.resolves('vmsTagResponse'));
        sinon.replace(provider, '_getCloudStorage', sinon.fake.resolves('bucketName'));

        return provider.init({ storageName: 'bucketName' })
            .then(() => {
                assert.strictEqual(provider.bucket, 'bucketName');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _sendRequest', () => {
        const method = 'GET';
        const requestUrl = '/';
        const options = {};
        const payload = { some_key: 'some_value' };

        const providerMakeRequestMock = sinon.stub(srcUtil, 'makeRequest');
        providerMakeRequestMock.resolves(payload);

        provider.accessToken = 'foo';

        return provider._sendRequest(method, requestUrl, options)
            .then((data) => {
                assert.strictEqual(data, payload);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _sendRequest rejects when no access token is provided', () => {
        const method = 'GET';
        const requestUrl = '/';
        const options = {};

        return provider._sendRequest(method, requestUrl, options)
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, '_sendRequest: no auth token. call init first');
            });
    });

    it('validate _checkOperationStatus', () => {
        const payload = { status: 'DONE' };
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        provider.accessToken = 'foo';

        return provider._checkOperationStatus()
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _checkOperationStatus rejects when task is not DONE', () => {
        const payload = { status: 'RUNNING' };
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        provider.accessToken = 'foo';

        return provider._checkOperationStatus()
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate uploadDataToStorage', () => {
        const fileName = 'test.json';
        const payload = { status: 'SUCCEEDED' };
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        return provider.uploadDataToStorage(fileName, payload)
            .then((data) => {
                assert.strictEqual(data, undefined);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate uploadDataToStorage rejects on error', () => {
        const fileName = '';
        const payload = { status: 'SUCCEEDED' };
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        return provider.uploadDataToStorage(fileName, payload)
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate downloadDataFromStorage', () => {
        const fileName = 'test.json';
        const payload = {
            code: '200',
            body: { status: 'SUCCEEDED' }
        };
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        return provider.downloadDataFromStorage(fileName)
            .then((data) => {
                assert.strictEqual(data, payload.body);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate downloadDataFromStorage resolves when file not found', () => {
        const fileName = 'test.json';
        const payload = '404 Not Found';
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        return provider.downloadDataFromStorage(fileName)
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate downloadDataFromStorage rejects on any other error', () => {
        const fileName = 'test.json';
        const payload = {
            code: '400'
        };
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves(payload);

        return provider.downloadDataFromStorage(fileName)
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    describe('updateAddresses should', () => {
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1', '2.2.2.2'];
        const forwardingRules = {
            type: 'name',
            fwdRuleNames: ['testFwdRule', 'testFwdRule2']
        };
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

        function validateFwdRuleOperations(getSpy, updateSpy, options) {
            options = options || {};
            assert.deepStrictEqual(
                getSpy.args[0][0].tags,
                options.getTags !== undefined ? options.getTags : { 'test-tag-key': 'test-tag-value' }
            );
            assert.deepEqual(updateSpy.args[0][0][0][0], 'testFwdRule');
            assert.deepEqual(updateSpy.args[0][0][0][1], 'selfLink/testInstanceName01');
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
            provider.accessToken = 'foo';
        });
        /* eslint-disable arrow-body-style */
        it('should validate method does not throw error if update operations is empty', () => {
            return provider.updateAddresses({ updateOperations: {} })
                .catch((err) => Promise.reject(err));
        });

        it('validate address failover', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            const updateFwdRulesSpy = sinon.stub(provider, '_updateFwdRules').resolves();

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                    validateFwdRuleOperations(getFwdRulesStub, updateFwdRulesSpy);
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate address failover with forwarding rules provided via label', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
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

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                    validateFwdRuleOperations(getFwdRulesStub, updateFwdRulesSpy);
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate address failover with forwarding rules parameter', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            const updateFwdRulesSpy = sinon.stub(provider, '_updateFwdRules').resolves();

            getFwdRulesStub.resolves([
                {
                    name: 'testFwdRule',
                    IPAddress: '2.2.2.2',
                    target: 'compute/testInstanceName02'
                }
            ]);

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                    validateFwdRuleOperations(getFwdRulesStub, updateFwdRulesSpy);
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate address failover with forwarding rules not requiring scoping tag', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.addressTagsRequired = false;

            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            const updateFwdRulesSpy = sinon.stub(provider, '_updateFwdRules').resolves();

            getFwdRulesStub.resolves([
                {
                    name: 'testFwdRule',
                    description: 'f5_cloud_failover_labels={"f5_target_instance_pair":"testInstanceName01,testInstanceName02"}',
                    IPAddress: '2.2.2.2',
                    target: 'compute/testInstanceName02'
                }
            ]);

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                    validateFwdRuleOperations(getFwdRulesStub, updateFwdRulesSpy, { getTags: null });
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate alias IP failover (without any fwd rules or target instances)', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();

            getFwdRulesStub.resolves([]);
            getTargetInstancesStub.resolves(null);

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => {
                    const fwdRuleOperations = operations;
                    fwdRuleOperations.loadBalancerAddresses = undefined;
                    return provider.updateAddresses({ updateOperations: fwdRuleOperations });
                })
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate alias IP failover (with unrelated fwd rule and no target instances)', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();

            getFwdRulesStub.resolves([
                {
                    name: 'randomFwdRule',
                    IPAddress: '3.3.3.3',
                    target: 'compute/randomTestInstance'
                }
            ]);
            getTargetInstancesStub.resolves(null);

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy);
                })
                .catch((err) => Promise.reject(err));
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

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateFwdRuleOperations(getFwdRulesStub, updateFwdRulesSpy);
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate address failover with all instances in a single zone', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            sinon.stub(provider, '_updateFwdRules').resolves();

            getVmsByTagsStub.resolves(util.deepCopy(mockSingleZoneVms));

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy, { zone: 'us-west1-a' });
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate address failover does not attempt to update access configs', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            const updateNicSpy = sinon.stub(provider, '_updateNic').resolves();
            sinon.stub(provider, '_updateFwdRules').resolves();

            getVmsByTagsStub.resolves(util.deepCopy(mockSingleZoneVms));

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    validateAliasIpOperations(updateNicSpy, { zone: 'us-west1-a' });
                    assert.strictEqual(updateNicSpy.args[0][2].accessConfigs, undefined);
                    assert.strictEqual(updateNicSpy.args[1][2].accessConfigs, undefined);
                })
                .catch((err) => Promise.reject(err));
        });

        it('validate updateAddresses method, promise rejection', () => {
            getVmsByTagsStub.rejects(new Error('rejection'));

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                .then(() => {
                    assert.ok(false, 'Expected an error');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('validate fwd rule throws error', () => {
            getTargetInstancesStub.resolves([
                {
                    name: 'someRandomTargetInstance',
                    instance: 'compute/someRandomTargetInstance',
                    selfLink: 'selfLink/someRandomTargetInstance'
                }
            ]);

            return provider.updateAddresses({
                localAddresses, failoverAddresses, forwardingRules, discoverOnly: true
            })
                .then(() => {
                    assert.ok(false, 'Status: The function should go to catch block!');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'Unable to locate our target instance: testInstanceName01');
                });
        });
    });

    describe('discoverAddressOperationsUsingDefinitions method', () => {
        /* eslint-disable arrow-body-style */
        it('validate correct execution for forwardingRule type', () => {
            provider.updateAddresses = sinon.stub().callsFake((parameters) => {
                return Promise.resolve(parameters);
            });
            const addresses = {
                localAddresses: ['1.2.3.4'],
                failoverAddresses: ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32a2']
            };
            const addressGroupDefinitions = [
                {
                    type: 'forwardingRule',
                    scopingName: 'forwardingRuleName',
                    targetInstances: [
                        'test-target-vm01',
                        'test-target-vm02'
                    ]
                }];
            const options = {
                isAddressOperationsEnabled: true
            };
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(response.localAddresses[0], '1.2.3.4');
                    assert.strictEqual(response.failoverAddresses[0], '10.10.10.10');
                    assert.strictEqual(response.failoverAddresses[1], '10.10.10.11');
                    assert.strictEqual(response.failoverAddresses[2], '2600:1f14:92a:bc03:8459:976:1950:32a2');
                    assert.strictEqual(response.forwardingRules.fwdRuleNames[0], 'forwardingRuleName');
                    assert.ok(response.discoverOnly);
                })
                .catch(() => assert.fail());
        });
        /* eslint-disable arrow-body-style */
        it('validate correct execution for aliasAddress type', () => {
            provider.updateAddresses = sinon.stub().callsFake((parameters) => {
                return Promise.resolve(parameters);
            });
            const addresses = {
                localAddresses: ['1.2.3.4'],
                failoverAddresses: ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32a2']
            };
            const addressGroupDefinitions = [
                {
                    type: 'aliasAddress',
                    scopingAddress: '10.0.12.112/28'
                }];
            const options = {
                isAddressOperationsEnabled: true
            };
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(response.localAddresses[0], '1.2.3.4');
                    assert.strictEqual(response.failoverAddresses[0], '10.10.10.10');
                    assert.strictEqual(response.failoverAddresses[1], '10.10.10.11');
                    assert.strictEqual(response.failoverAddresses[2], '2600:1f14:92a:bc03:8459:976:1950:32a2');
                    assert.strictEqual(response.forwardingRules.fwdRuleNames.length, 0);
                    assert.strictEqual(response.aliasAddresses[0], '10.0.12.112/28');
                    assert.ok(response.discoverOnly);
                })
                .catch(() => assert.fail());
        });
        /* eslint-disable arrow-body-style */
        it('validate correct execution for aliasAddress type when isAddressOperationsEnabled is set to false', () => {
            provider.updateAddresses = sinon.stub().callsFake((parameters) => {
                return Promise.resolve(parameters);
            });
            const addresses = {
                localAddresses: ['1.2.3.4'],
                failoverAddresses: ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32a2']
            };
            const addressGroupDefinitions = [
                {
                    type: 'aliasAddress',
                    scopingAddress: '10.0.12.112/28'
                }];
            const options = {
                isAddressOperationsEnabled: false
            };
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(response, undefined);
                })
                .catch(() => assert.fail());
        });
    });

    describe('updateRoutes should', () => {
        const localAddresses = ['1.1.1.1', '2.2.2.2'];

        let providerSendRequestMock;

        beforeEach(() => {
            const getRouteTablesResponse = [
                {
                    name: 'test-route',
                    kind: 'test-route',
                    description: routeTableDescription,
                    id: 'some-test-id',
                    creationTimestamp: '101010101010',
                    selfLink: 'https://test-self-link',
                    nextHopIp: '1.1.1.2',
                    destRange: '192.0.0.0/24'
                },
                {
                    name: 'test-route-2',
                    kind: 'test-route-2',
                    description: routeTableDescription,
                    id: 'some-test-2-id',
                    creationTimestamp: '101010101010',
                    selfLink: 'https://test-self-2-link',
                    nextHopIp: '1.1.1.4',
                    destRange: '192.0.0.1/24'
                }
            ];
            sinon.stub(provider, '_getRouteTables').resolves(getRouteTablesResponse);

            providerSendRequestMock = sinon.stub(provider, '_sendRequest');
            providerSendRequestMock.resolves({
                name: 'test-name'
            });

            provider.routeGroupDefinitions[0].routeAddressRanges = [
                {
                    routeAddresses: ['192.0.0.0/24']
                }];
        });

        it('not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateRoutes(opts)
                .catch((err) => Promise.reject(err));
        });

        it('update routes using next hop discovery method: routeTag', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses = {
                type: 'routeTag',
                tag: 'f5_self_ips'
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using next hop discovery method: static', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses = {
                type: 'static',
                items: ['1.1.1.1', '2.2.2.2']
            };

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update multiple routes using next hop discovery method', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions[0].routeAddressRanges = [
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
            providerSendRequestMock.resolves({
                name: 'test-name-2'
            });

            return provider.updateRoutes({ localAddresses: ['1.1.1.1', '2.2.2.2'], discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][2].body.nextHopIp, '1.1.1.1');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using multiple route group definitions', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions = [
                {
                    routeTags: { mylabel: 'mydeployment' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                },
                {
                    routeTags: { mylabel: 'mydeployment' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.1/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                }
            ];
            providerSendRequestMock.resolves({
                name: 'test-name-2'
            });

            return provider.updateRoutes({ localAddresses: ['1.1.1.1', '2.2.2.2'], discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][2].body.nextHopIp, '1.1.1.1');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using multiple route group definitions with mix name and tag', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions = [
                {
                    routeName: 'test-route',
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.0/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                },
                {
                    routeTags: { mylabel: 'mydeployment' },
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.0.1/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                }
            ];
            providerSendRequestMock.resolves({
                name: 'test-name-2'
            });

            return provider.updateRoutes({ localAddresses: ['1.1.1.1', '2.2.2.2'], discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][2].body.nextHopIp, '1.1.1.1');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using multiple route group definitions with routes names', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions = [
                {
                    routeName: 'test-route',
                    routeAddressRanges: [
                        {
                            routeAddresses: 'all',
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                },
                {
                    routeName: 'test-route-2',
                    routeAddressRanges: [
                        {
                            routeAddresses: 'all',
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                }
            ];
            providerSendRequestMock.resolves({
                name: 'test-name-2'
            });

            return provider.updateRoutes({ localAddresses: ['1.1.1.1', '2.2.2.2'], discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[2][2].body.nextHopIp, '1.1.1.1');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[3][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });

        it('update routes using route name and special "all" route address', () => {
            provider._checkOperationStatus = sinon.stub().resolves();
            provider.routeGroupDefinitions = [
                {
                    routeName: 'test-route',
                    routeAddressRanges: [
                        {
                            routeAddresses: 'all',
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['1.1.1.1', '2.2.2.2']
                            }
                        }
                    ]
                }
            ];

            return provider.updateRoutes({ localAddresses, discoverOnly: true })
                .then((operations) => provider.updateRoutes({ updateOperations: operations }))
                .then(() => {
                    assert.deepStrictEqual(providerSendRequestMock.args[0][0], 'DELETE');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][0], 'POST');
                    assert.deepStrictEqual(providerSendRequestMock.args[1][2].body.nextHopIp, '1.1.1.1');
                })
                .catch((err) => Promise.reject(err));
        });
    });

    it('validate _getRouteTables method execution', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/global/routes/');

            return Promise.resolve({
                name: 'test-name',
                items: [
                    {
                        name: 'ourRoute',
                        description: routeTableDescription
                    }
                ]
            });
        });

        return provider._getRouteTables()
            .then((data) => {
                assert.strictEqual(data[0].name, 'ourRoute');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _getRouteTables method execution with page token', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/global/routes/');

            return Promise.resolve({
                name: 'test-name',
                items: [
                    {
                        name: 'ourRoute'
                    }
                ],
                nextPageToken: 'token'
            });
        });

        providerSendRequestMock.onCall(1).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/global/routes?pageToken=token');

            return Promise.resolve({
                name: 'test-name',
                items: [
                    {
                        name: 'ourPaginatedRoute',
                        description: routeTableDescription
                    }
                ]
            });
        });

        return provider._getRouteTables()
            .then((data) => {
                assert.strictEqual(data[1].name, 'ourPaginatedRoute');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _getRouteTables method execution no routes found', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/global/routes/');

            return Promise.resolve({
                name: 'test-name',
                items: []
            });
        });

        return provider._getRouteTables()
            .then((data) => {
                assert.ok(data.length === 0);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _getRouteTables method promise rejection', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'global/routes/');

            return Promise.reject();
        });

        return provider._getRouteTables()
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _getLocalMetadata', () => {
        srcUtil.makeRequest = sinon.stub().resolves('test-data');

        assert.strictEqual(provider.environment, cloud);
        return provider._getLocalMetadata('test-entry')
            .then((data) => {
                assert.ok(true);
                assert.strictEqual(data, 'test-data');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate promise rejection for _getLocalMetadata', () => {
        srcUtil.makeRequest = sinon.stub().rejects();

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

    it('validate _matchFwdRuleNames method', () => {
        assert.strictEqual(provider.environment, cloud);
        const result = provider._matchFwdRuleNames(['testFwdRule', 'testFwdRule2'], [{ forwardingRuleName: 'testFwdRule' }]);
        assert.strictEqual(result[0], 'testFwdRule');
    });

    it('validate _getVmMetadata', () => {
        provider.zone = 'us-west1-a';
        sinon.stub(provider, '_sendRequest').resolves({ items: 'test_data' });
        sinon.stub(provider, '_getVmMetadata').callsFake((vmName) => {
            assert.strictEqual(vmName, 'test-vm');
            return Promise.resolve();
        });

        return provider._getVmMetadata('test-vm')
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
                assert.ok(data.length > 0);
                assert.strictEqual(data[0], 'test_data');
            })
            .catch((err) => Promise.reject(err));
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
        sinon.replace(provider, '_sendRequest', sinon.fake.resolves({ items: [{ name: 'testFwdRule' }] }));

        return provider._getFwdRules()
            .then((data) => {
                assert.strictEqual(data[0].name, 'testFwdRule');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _getFwdRules filters based on tag', () => {
        sinon.replace(provider, '_sendRequest', sinon.fake.resolves({
            items: [
                {
                    name: 'notOurTestFwdRule',
                    IPAddress: 'x.x.x.x',
                    target: 'compute/xxxx'
                },
                {
                    name: 'testFwdRule',
                    IPAddress: 'x.x.x.x',
                    target: 'compute/xxxx',
                    description: 'f5_cloud_failover_labels={"key01":"value01"}'
                }
            ]
        }));

        return provider._getFwdRules({ tags: { key01: 'value01' } })
            .then((data) => {
                assert.strictEqual(data[0].name, 'testFwdRule');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _getFwdRules returned promise even with pageTokens', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        provider.region = 'region';
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/regions/region/forwardingRules');

            return Promise.resolve({
                items: 'test_data',
                nextPageToken: 'token'
            });
        });
        providerSendRequestMock.onCall(1).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/regions/region/forwardingRules?pageToken=token');

            return Promise.resolve({
                items: 'test_data2',
                nextPageToken: 'token'
            });
        });
        providerSendRequestMock.onCall(2).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/regions/region/forwardingRules?pageToken=token');

            return Promise.resolve({
                items: 'test_data3',
                nextPageToken: 'token'
            });
        });
        providerSendRequestMock.onCall(3).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/regions/region/forwardingRules?pageToken=token');

            return Promise.resolve({
                items: 'test_data4',
                nextPageToken: 'token'
            });
        });
        providerSendRequestMock.onCall(4).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/undefined/regions/region/forwardingRules?pageToken=token');

            return Promise.resolve({
                items: 'test_data5'
            });
        });
        return provider._getFwdRules()
            .then((data) => {
                assert.strictEqual(data[0], 'test_data');
                assert.strictEqual(data[1], 'test_data2');
                assert.strictEqual(data[2], 'test_data3');
                assert.strictEqual(data[3], 'test_data4');
                assert.strictEqual(data[4], 'test_data5');
            })
            .catch((err) => Promise.reject(err));
    });

    /* eslint-disable arrow-body-style */
    it('validate _updateFwdRule method execution', () => {
        provider.region = 'region';
        provider.name = 'rule';
        provider.projectId = 'project-id';
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'POST');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/project-id/regions/region/forwardingRules/test-rule/setTarget');

            return Promise.resolve({
                data:
                    {
                        name: 'test-rule'
                    }
            });
        });
        return provider._updateFwdRule('test-rule', 'target')
            .then(() => {
                assert.ok(true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _updateFwdRule method promise rejection', () => {
        return provider._updateFwdRule()
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _updateNic method execution', () => {
        provider.zone = 'us-west-1';
        sinon.stub(provider, '_sendRequest').resolves({
            selfLink: 'foo'
        });
        return provider._updateNic()
            .then((response) => {
                assert.strictEqual(response, 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _updateNic method promise rejection', () => {
        return provider._updateNic()
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _deleteRoute method execution', () => {
        const item = {
            id: 'bar'
        };
        sinon.stub(provider, '_sendRequest').resolves({
            selfLink: 'foo'
        });
        return provider._deleteRoute(item)
            .then((response) => {
                assert.strictEqual(response, 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _deleteRoute method promise rejection', () => {
        const item = {
            id: 'bar'
        };
        return provider._deleteRoute(item)
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _createRoute method execution', () => {
        const item = {
            id: 'bar',
            creationTimestamp: 'baz',
            kind: 'bax',
            selfLink: 'foo'
        };
        sinon.stub(provider, '_sendRequest').resolves({
            selfLink: 'foo'
        });
        return provider._createRoute(item)
            .then((response) => {
                assert.strictEqual(response, 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate _createRoute method promise rejection', () => {
        const item = {
            id: 'bar',
            creationTimestamp: 'baz',
            kind: 'bax',
            selfLink: 'foo'
        };
        return provider._createRoute(item)
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate _getVmsByTags', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        provider.region = 'region';
        provider.name = 'rule';
        provider.projectId = 'project-id';
        provider._getVmInfo = sinon.stub().resolves('test_data');
        provider.accessToken = 'access-token';
        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/project-id/aggregated/instances?filter=labels.test-tag-key eq test-tag-value');

            return Promise.resolve({
                items: {
                    zones: {
                        instances: [{
                            kind: 'vmsData', name: 'test-vm', labels: provider.addressTags, zone: 'projects/1111/zones/us-west1-a'
                        }]
                    }
                }
            });
        });

        return provider._getVmsByTags(provider.addressTags)
            .then((data) => {
                assert.strictEqual(data[0], 'test_data');
            });
    });

    it('validate _getVmsByTags with extra tags', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        provider.region = 'region';
        provider.name = 'rule';
        provider.projectId = 'project-id';
        provider._getVmInfo = sinon.stub().resolves('test_data');
        provider.accessToken = 'access-token';

        providerSendRequestMock.onCall(0).callsFake((method, path) => {
            assert.strictEqual(method, 'GET');
            assert.strictEqual(path, 'https://www.googleapis.com/compute/v1/projects/project-id/aggregated/instances?filter=labels.test-tag-key eq test-tag-value');

            return Promise.resolve({
                items: {
                    zones: {
                        instances: [{
                            kind: 'vmsData', name: 'test-vm', labels: { 'test-label-1': 'test-value-1', 'missing-label': 'missing-label-value' }, zone: 'projects/1111/zones/us-west1-a'
                        }]
                    }
                }
            });
        });

        return provider._getVmsByTags(provider.addressTags)
            .then((data) => {
                assert.ok(data.length === 1);
                assert.strictEqual(data[0], 'test_data');
            });
    });

    it('validate _getCloudStorage', () => {
        const providerSendRequestMock = sinon.stub(provider, '_sendRequest');
        providerSendRequestMock.resolves({ items: [{ name: 'notOurBucket', labels: { some_key: 'some_value' } }, { name: 'ourBucket', labels: { foo: 'bar', foo1: 'bar1' } }] });

        return provider._getCloudStorage({ foo: 'bar', foo1: 'bar1' })
            .then((data) => {
                assert.strictEqual(data, 'ourBucket');
            })
            .catch((err) => Promise.reject(err));
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
            sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwdRuleResponse'));
            sinon.replace(provider, '_getCloudStorage', sinon.fake.resolves('bucketResponse'));
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
            return provider.init(mockInitData)
                .then(() => {
                    provider._getRouteTables = sinon.stub().resolves(([
                        {
                            id: '123',
                            name: 'x',
                            network: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x',
                            nextHopIp: '1.1.1.1',
                            description: routeTableDescription
                        }
                    ]));
                })
                .then(() => {
                    return provider.getAssociatedAddressAndRouteInfo(true, true);
                })
                .then((data) => {
                    assert.deepStrictEqual(data, expectedData);
                })
                .catch((err) => Promise.reject(new Error(`${err.stack}`)));
        });

        it('skip routes for active device', () => {
            return provider.init(mockInitData)
                .then(() => {
                    provider._getRouteTables = sinon.stub().resolves(([
                        {
                            id: '123',
                            name: 'x',
                            network: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x',
                            nextHopIp: '1.1.1.1',
                            description: routeTableDescription
                        }
                    ]));
                })
                .then(() => {
                    return provider.getAssociatedAddressAndRouteInfo(true, false);
                })
                .then((data) => {
                    assert.deepStrictEqual(data, expectedData);
                })
                .catch((err) => Promise.reject(new Error(`${err.stack}`)));
        });

        it('skip addresses for active device', () => {
            expectedData.routes.push({
                routeTableId: '123',
                routeTableName: 'x',
                networkId: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x'
            });
            expectedData.addresses.pop();
            return provider.init(mockInitData)
                .then(() => {
                    provider._getRouteTables = sinon.stub().resolves(([
                        {
                            id: '123',
                            name: 'x',
                            network: 'https://www.googleapis.com/compute/v1/projects/x/global/networks/x',
                            nextHopIp: '1.1.1.1',
                            description: routeTableDescription
                        }
                    ]));
                })
                .then(() => {
                    return provider.getAssociatedAddressAndRouteInfo(false, true);
                })
                .then((data) => {
                    assert.deepStrictEqual(data, expectedData);
                })
                .catch((err) => Promise.reject(new Error(`${err.stack}`)));
        });

        it('validate return addresses and not routes for standby device', () => {
            return provider.init(mockInitData)
                .then(() => {
                    provider._getRouteTables = sinon.stub().resolves(([]));
                })
                .then(() => {
                    return provider.getAssociatedAddressAndRouteInfo(true, true);
                })
                .then((data) => {
                    assert.deepStrictEqual(data, expectedData);
                })
                .catch((err) => Promise.reject(err));
        });
    });
});
