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
        sinon.replace(provider, '_getVmsByTag', sinon.fake.resolves('vmsTagResponse'));

        const testPayload = {
            tags: [
                {
                    key: 'key01',
                    value: 'value01'
                }
            ]
        };

        return provider.init(testPayload)
            .then(() => {
                assert.strictEqual(provider.fwdRules, 'fwrResponse');
                assert.strictEqual(provider.instanceName, 'GoogleInstanceName');
                assert.strictEqual(provider.targetInstances, 'targetInstanceResponse');
            })
            .catch(() => {
                assert.ok(false);
            });
    });


    it('validate promise rejection for init method', () => {
        assert.strictEqual(typeof provider.init, 'function');


        sinon.replace(provider, '_getLocalMetadata', sinon.fake.resolves('GoogleInstanceName'));
        sinon.replace(provider, '_getTargetInstances', sinon.fake.resolves('targetInstanceResponse'));
        sinon.replace(provider, '_getFwdRules', sinon.fake.resolves('fwrResponse'));
        sinon.replace(provider, '_getVmsByTag', sinon.fake.rejects('test-error'));

        const testPayload = {
            tags: [
                {
                    key: 'key01',
                    value: 'value01'
                }
            ]
        };

        return provider.init(testPayload)
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'test-error');
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

        sinon.replace(provider, '_updateNic', sinon.fake.resolves());
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];
        provider.vms = [{ name: 'testInstanceName', networkInterfaces: [{ name: 'testNic' }] }, { name: 'testInstanceName02', networkInterfaces: [{ name: 'testNic', aliasIpRanges: ['10.0.2.1/24'] }] }];
        provider.instanceName = 'testInstanceName';
        provider.fwdRules = [{ name: 'testFwrRule' }];
        provider.targetInstances = [{ name: 'testTargetInstance' }];


        return provider.updateAddresses(localAddresses, failoverAddresses)
            .then(() => {
                assert.ok(true);
            })
            .catch(() => {
                assert.ok(false);
            });
    });

    it('validate promise rejection for updateAddresses method', () => {
        assert.strictEqual(typeof provider.updateAddresses, 'function');
        sinon.stub(provider, '_updateNics').callsFake((localAddresses, failoverAddresses) => {
            assert.strictEqual(localAddresses[0], '1.1.1.1');
            assert.strictEqual(localAddresses[1], '4.4.4.4');
            assert.strictEqual(failoverAddresses[0], '10.0.2.1');
            return Promise.reject();
        });

        sinon.replace(provider, '_updateNic', sinon.fake.resolves());
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];
        provider.vms = [{ name: 'testInstanceName', networkInterfaces: [{ name: 'testNic' }] }, { name: 'testInstanceName02', networkInterfaces: [{ name: 'testNic', aliasIpRanges: ['10.0.2.1/24'] }] }];
        provider.instanceName = 'testInstanceName';
        provider.fwdRules = [{ name: 'testFwrRule' }];
        provider.targetInstances = [{ name: 'testTargetInstance' }];


        return provider.updateAddresses(localAddresses, failoverAddresses)
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
            .catch(() => {
                assert.ok(false);
            });
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
            .catch(() => {
                assert.ok(false);
            });
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
            .catch(() => {
                assert.ok(false);
            });
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

    it('validate _updateNics', () => {
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];


        provider.instanceName = 'test-vm-01';
        provider.vms = [{ name: 'test-vm-01', networkInterfaces: [{ name: 'testNic', aliasIpRanges: [] }] }, { name: 'test-vm-02', networkInterfaces: [{ name: 'testNic', aliasIpRanges: ['10.0.2.1/24'] }] }];
        sinon.replace(provider, '_updateNic', sinon.fake.resolves());

        return provider._updateNics(localAddresses, failoverAddresses)
            .then(() => {
                assert.ok(true);
            })
            .catch(() => {
                assert.ok(false);
            });
    });

    it('validate promise rejection for_updateNics due to missing failover ip', () => {
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = [];

        provider.instanceName = 'test-vm-01';
        provider.vms = [{ name: 'test-vm-01', networkInterfaces: [{ name: 'testNic', aliasIpRanges: [] }] }, { name: 'test-vm-02', networkInterfaces: [{ name: 'testNic', aliasIpRanges: ['10.0.2.1/24'] }] }];
        sinon.replace(provider, '_updateNic', sinon.fake.rejects());

        return provider._updateNics(localAddresses, failoverAddresses)
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
            });
    });

    it('validate promise rejection for_updateNics due to missing myVms', () => {
        const localAddresses = ['1.1.1.1', '4.4.4.4'];
        const failoverAddresses = ['10.0.2.1'];

        provider.instanceName = 'this-is-invalid';
        provider.vms = [{ name: 'test-vm-01', networkInterfaces: [{ name: 'testNic', aliasIpRanges: [] }] }, { name: 'test-vm-02', networkInterfaces: [{ name: 'testNic', aliasIpRanges: ['10.0.2.1/24'] }] }];
        sinon.replace(provider, '_updateNic', sinon.fake.resolves());

        return provider._updateNics(localAddresses, failoverAddresses)
            .then(() => {
                assert.ok(false);
            })
            .catch(() => {
                assert.ok(true);
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
            .catch(() => {
                assert.ok(false);
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
            .catch(() => {
                assert.ok(false);
            });
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
            .catch(() => {
                assert.ok(false);
            });
    });

    it('validate promise rejection for _getVmsByTag due to missing tags', () => {
        sinon.stub();
        return provider._getVmsByTag()
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'getVmsByTag: no tag, load configuration file first');
            });
    });

    it('validate promise rejection for _getVmsByTag during compute.getVMs execution', () => {
        provider.compute = sinon.stub();
        provider.compute.getVMs = sinon.stub().rejects();

        return provider._getVmsByTag({ key: 'key01', value: 'value01' })
            .then(() => {
                assert.ok(false);
            })
            .catch((error) => {
                assert.strictEqual(error.message, 'Error');
            });
    });


    it('validate promise resolve for _getVmsByTag method during compute.getVMs execution', () => {
        provider.compute = sinon.stub();
        provider.compute.getVMs = sinon.stub().resolves([[{ kind: 'vmsData', name: 'test-vm' }]]);
        provider._getVmInfo = sinon.stub().resolves('test_data');

        return provider._getVmsByTag({ key: 'key01', value: 'value01' })
            .then((data) => {
                assert.strictEqual(data[0], 'test_data');
            })
            .catch(() => {
                assert.ok(false);
            });
    });
});
