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

    const globalSettingsMockResponse = {
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
        sinon.stub(device.prototype, 'executeBigIpBashCmd').resolves('');

        cloudProviderMock = {
            init: () => Promise.resolve({}),
            updateAddresses: () => Promise.resolve({}),
            updateRoutes: () => Promise.resolve({}),
            downloadDataFromStorage: () => Promise.resolve({}),
            uploadDataToStorage: () => Promise.resolve({})
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

        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.RUN });
        downloadDataFromStorageMock.onCall(1).resolves({ taskState: constants.FAILOVER_STATES.PASS });

        const spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');
        const spyOnUpdateRoutes = sinon.spy(cloudProviderMock, 'updateRoutes');

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        deviceGetTrafficGroupsMock.returns(globalSettingsMockResponse);
        const getSelfAddressesResponse = [
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1',
                trafficGroup: 'local_only'
            }
        ];
        deviceGetSelfAddressesMock.returns(getSelfAddressesResponse);
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
                // verify that cloudProvider.updateAddresses method gets called - discover
                const updateAddressesDiscoverCall = spyOnUpdateAddresses.getCall(0).args[0];
                assert.deepStrictEqual(updateAddressesDiscoverCall.localAddresses, ['1.1.1.1']);
                assert.deepStrictEqual(updateAddressesDiscoverCall.failoverAddresses, ['2.2.2.2']);
                assert.strictEqual(updateAddressesDiscoverCall.discoverOnly, true);

                // verify that cloudProvider.updateAddresses method gets called - update
                const updateAddressesUpdateCall = spyOnUpdateAddresses.getCall(1).args[0];
                assert.deepStrictEqual(updateAddressesUpdateCall.updateOperations, {});

                // verify that cloudProvider.updateRoutes method gets called - discover
                const updateRoutesDiscoverCall = spyOnUpdateRoutes.getCall(0).args[0];
                assert.deepStrictEqual(updateRoutesDiscoverCall.localAddresses, ['1.1.1.1']);
                assert.strictEqual(updateRoutesDiscoverCall.discoverOnly, true);

                // verify that cloudProvider.updateRoutes method gets called - update
                const updateRoutesUpdateCall = spyOnUpdateRoutes.getCall(1).args[0];
                assert.deepStrictEqual(updateRoutesUpdateCall.updateOperations, {});
            })
            .catch(err => Promise.reject(err));
    });

    it('validate case when no virtualAddresses available', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);

        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.PASS });

        const spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        deviceGetTrafficGroupsMock.returns(globalSettingsMockResponse);
        const getSelfAddressesResponse = [
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1',
                trafficGroup: 'local_only'
            }
        ];
        deviceGetSelfAddressesMock.returns(getSelfAddressesResponse);
        deviceGetVirtualAddressesMock.returns([]);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                const updateAddressesDiscoverCall = spyOnUpdateAddresses.getCall(0).args[0];
                assert.deepStrictEqual(updateAddressesDiscoverCall.failoverAddresses, []);
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
        deviceGetTrafficGroupsMock.returns(globalSettingsMockResponse);
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

    it('validate that it recovers from previous failover failure', () => {
        mockCloudFactory = sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        const setConfigSpy = sinon.stub(Object.getPrototypeOf(config), 'setConfig').resolves();
        const setTaskStateSpy = sinon.stub(Object.getPrototypeOf(config), 'setTaskState').resolves();
        const uploadDataToStorageSpy = sinon.stub(cloudProviderMock, 'uploadDataToStorage').resolves({});
        const downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.onCall(0).resolves({
            taskState: constants.FAILOVER_STATES.FAIL,
            failoverOperations: {
                addresses: {
                    operation: 'addresses'
                },
                routes: {
                    operation: 'routes'
                }
            },
            message: 'Failover failed because of x'
        });

        const spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');
        const spyOnUpdateRoutes = sinon.spy(cloudProviderMock, 'updateRoutes');

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                // verify that cloudProvider.updateAddresses method gets called - update
                const updateAddressesCall = spyOnUpdateAddresses.getCall(0).args[0];
                assert.deepStrictEqual(updateAddressesCall.updateOperations, { operation: 'addresses' });

                // verify that cloudProvider.updateRoutes method gets called - update
                const updateRoutesCall = spyOnUpdateRoutes.getCall(0).args[0];
                assert.deepStrictEqual(updateRoutesCall.updateOperations, { operation: 'routes' });

                // verify that the uploaded task state is running and then eventually succeeded
                assert.strictEqual(uploadDataToStorageSpy.getCall(0).args[1].taskState, constants.FAILOVER_STATES.RUN);
                assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
                assert.strictEqual(setConfigSpy.getCall(0).lastArg.environment, 'azure');
                assert.strictEqual(setTaskStateSpy.lastCall.lastArg.message, 'Failover Completed Successfully');
            })
            .catch(err => Promise.reject(err));
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
