/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line import/no-extraneous-dependencies
const constants = require('../constants.js');

const declaration = constants.declarations.basic;
const restWorker = constants.restWorker;

/* eslint-disable global-require */

describe('Failover', () => {
    let config;
    let failover;
    let CloudFactory;
    let f5CloudLibs;
    let device;

    let mockCloudFactory;
    let mockBigIpInit;
    let mockBigIpList;
    let deviceGlobalSettingsMock;
    let deviceGetTrafficGroupsMock;
    let deviceGetSelfAddressesMock;
    let deviceGetVirtualAddressesMock;
    let cloudProviderMock;

    beforeEach(() => {
        config = require('../../src/nodejs/config.js');
        device = require('../../src/nodejs/device.js');
        CloudFactory = require('../../src/nodejs/providers/cloudFactory.js');
        f5CloudLibs = require('@f5devcentral/f5-cloud-libs');

        const FailoverClient = require('../../src/nodejs/failover.js').FailoverClient;
        failover = new FailoverClient();

        deviceGlobalSettingsMock = sinon.stub(device.prototype, 'getGlobalSettings');
        deviceGetTrafficGroupsMock = sinon.stub(device.prototype, 'getTrafficGroupsStats');
        deviceGetSelfAddressesMock = sinon.stub(device.prototype, 'getSelfAddresses');
        deviceGetVirtualAddressesMock = sinon.stub(device.prototype, 'getVirtualAddresses');

        mockBigIpInit = sinon.stub(f5CloudLibs.bigIp.prototype, 'init').resolves();
        mockBigIpList = sinon.stub(f5CloudLibs.bigIp.prototype, 'list');
        sinon.stub(f5CloudLibs.bigIp.prototype, 'create').returns();
        sinon.stub(Object.getPrototypeOf(config), 'updateTriggerScripts').resolves();

        cloudProviderMock = {
            init: () => {},
            updateAddresses: () => {},
            updateRoutes: () => {},
            downloadDataFromStorage: () => {},
            uploadDataToStorage: () => {}
        };
    });
    afterEach(() => {
        sinon.restore();
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('validate that it performs failover', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        const spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');
        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.RUNNING });
        downloadDataFromStorageMock.onCall(1).resolves({ taskState: constants.FAILOVER_STATES.PASS });

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        const globalSettingsValuesMock = {
            entries: {
                key01: {
                    nestedStats: {
                        entries: {
                            deviceName: { description: 'some_hostname' },
                            failoverState: { description: 'active' },
                            trafficGroup: { description: 'some_trafficGroup' }
                        }
                    }
                }
            }
        };
        deviceGetTrafficGroupsMock.returns(globalSettingsValuesMock);
        const trafficGroupsValuesMock = [
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetSelfAddressesMock.returns(trafficGroupsValuesMock);
        const virtualAddressesValuesMock = [
            {
                address: '2.2.2.2',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetVirtualAddressesMock.returns(virtualAddressesValuesMock);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                // verify that cloudProvider.updateAddresses method gets called with expected failover ip addresses
                assert.strictEqual(spyOnUpdateAddresses.args[0][1][0], '1.1.1.1');
                assert.strictEqual(spyOnUpdateAddresses.args[0][1][1], '2.2.2.2');
                assert.strictEqual(mockCloudFactory.called, true);
                assert.strictEqual(mockBigIpInit.called, true);
                assert.strictEqual(mockBigIpList.called, true);

                assert.strictEqual(deviceGlobalSettingsMock.called, true);
                assert.strictEqual(deviceGetTrafficGroupsMock.called, true);
                assert.strictEqual(deviceGetSelfAddressesMock.called, true);
                assert.strictEqual(deviceGetVirtualAddressesMock.called, true);
            });
    });

    it('validate case when no virtualAddresses available', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.PASS });

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        const globalSettingsValuesMock = {
            entries: {
                key01: {
                    nestedStats: {
                        entries: {
                            deviceName: { description: 'some_hostname' },
                            failoverState: { description: 'active' },
                            trafficGroup: { description: 'some_trafficGroup' }
                        }
                    }
                }
            }
        };
        deviceGetTrafficGroupsMock.returns(globalSettingsValuesMock);
        const trafficGroupsValuesMock = [
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetSelfAddressesMock.returns(trafficGroupsValuesMock);
        deviceGetVirtualAddressesMock.returns([]);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                assert.strictEqual(mockCloudFactory.called, true);
                assert.strictEqual(mockBigIpInit.called, true);
                assert.strictEqual(mockBigIpList.called, true);

                assert.strictEqual(deviceGlobalSettingsMock.called, true);
                assert.strictEqual(deviceGetTrafficGroupsMock.called, true);
                assert.strictEqual(deviceGetSelfAddressesMock.called, true);
                assert.strictEqual(deviceGetVirtualAddressesMock.called, true);
            });
    });


    it('validate case when no trafficGroupMatch available', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.PASS });

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        const globalSettingsValuesMock = {
            entries: {
                key01: {
                    nestedStats: {
                        entries: {
                            deviceName: { description: 'some_hostname' },
                            failoverState: { description: 'active' },
                            trafficGroup: { description: 'some_other_trafficGroup' }
                        }
                    }
                }
            }
        };
        deviceGetTrafficGroupsMock.returns(globalSettingsValuesMock);
        const trafficGroupsValuesMock = [
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1/24',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetSelfAddressesMock.returns(trafficGroupsValuesMock);
        const virtualAddressesValuesMock = [
            {
                address: '2.2.2.2',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetVirtualAddressesMock.returns(virtualAddressesValuesMock);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                assert.strictEqual(mockCloudFactory.called, true);
                assert.strictEqual(mockBigIpInit.called, true);
                assert.strictEqual(mockBigIpList.called, true);

                assert.strictEqual(deviceGlobalSettingsMock.called, true);
                assert.strictEqual(deviceGetTrafficGroupsMock.called, true);
                assert.strictEqual(deviceGetSelfAddressesMock.called, true);
                assert.strictEqual(deviceGetVirtualAddressesMock.called, true);
            });
    });

    it('validate case when device is not local', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.PASS });

        deviceGlobalSettingsMock.returns({ hostname: 'some_other_hostname' });
        const globalSettingsValuesMock = {
            entries: {
                key01: {
                    nestedStats: {
                        entries: {
                            deviceName: { description: 'some_hostname' },
                            failoverState: { description: 'active' },
                            trafficGroup: { description: 'some_trafficGroup' }
                        }
                    }
                }
            }
        };
        deviceGetTrafficGroupsMock.returns(globalSettingsValuesMock);
        const trafficGroupsValuesMock = [
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1/24',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetSelfAddressesMock.returns(trafficGroupsValuesMock);
        const virtualAddressesValuesMock = [
            {
                address: '2.2.2.2',
                trafficGroup: 'some_trafficGroup'
            }
        ];
        deviceGetVirtualAddressesMock.returns(virtualAddressesValuesMock);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                assert.strictEqual(mockCloudFactory.called, true);
                assert.strictEqual(mockBigIpInit.called, true);
                assert.strictEqual(mockBigIpList.called, true);

                assert.strictEqual(deviceGlobalSettingsMock.called, true);
                assert.strictEqual(deviceGetTrafficGroupsMock.called, true);
                assert.strictEqual(deviceGetSelfAddressesMock.called, true);
                assert.strictEqual(deviceGetVirtualAddressesMock.called, true);
            });
    });


    it('validate error case for failover execute', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.PASS });

        deviceGlobalSettingsMock.returns();
        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                assert.fail();
            })
            .catch(() => {
                // fails when error recieved
                assert.ok(true);
            });
    });

    it('validate case when enviroment is not provided for failover execute', () => {
        sinon.stub(Object.getPrototypeOf(config), 'getConfig').resolves({});
        return failover.execute()
            .then(() => {
                assert.fail();
            })
            .catch(() => {
                // fails when error recieved
                assert.ok(true);
            });
    });
});
