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

    let deviceGlobalSettingsMock;
    let deviceGetTrafficGroupsMock;
    let deviceGetSelfAddressesMock;
    let deviceGetVirtualAddressesMock;
    let cloudProviderMock;
    let downloadDataFromStorageMock;

    let spyOnUpdateAddresses;
    let spyOnUpdateRoutes;
    let uploadDataToStorageSpy;
    let setConfigSpy;
    let setTaskStateSpy;

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

        sinon.stub(device.prototype, 'discoverMgmtPort').resolves(443);
        deviceGlobalSettingsMock = sinon.stub(device.prototype, 'getGlobalSettings');
        deviceGetTrafficGroupsMock = sinon.stub(device.prototype, 'getTrafficGroupsStats');
        deviceGetSelfAddressesMock = sinon.stub(device.prototype, 'getSelfAddresses');
        deviceGetVirtualAddressesMock = sinon.stub(device.prototype, 'getVirtualAddresses');

        sinon.stub(f5CloudLibs.bigIp.prototype, 'init').resolves();
        sinon.stub(f5CloudLibs.bigIp.prototype, 'list');
        sinon.stub(f5CloudLibs.bigIp.prototype, 'create').returns();
        sinon.stub(device.prototype, 'executeBigIpBashCmd').resolves('');

        cloudProviderMock = {
            init: () => Promise.resolve({}),
            updateAddresses: () => Promise.resolve({}),
            updateRoutes: () => Promise.resolve({}),
            downloadDataFromStorage: () => Promise.resolve({}),
            uploadDataToStorage: () => Promise.resolve({})
        };
        sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);

        downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.PASS });

        spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');
        spyOnUpdateRoutes = sinon.spy(cloudProviderMock, 'updateRoutes');

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        deviceGetTrafficGroupsMock.returns(globalSettingsMockResponse);

        deviceGetSelfAddressesMock.returns([
            {
                name: 'some_trafficGroup',
                address: '1.1.1.1',
                trafficGroup: 'local_only'
            }
        ]);
        deviceGetVirtualAddressesMock.returns([
            {
                address: '2.2.2.2',
                trafficGroup: 'some_trafficGroup',
                parition: 'Common'
            }
        ]);

        uploadDataToStorageSpy = sinon.stub(cloudProviderMock, 'uploadDataToStorage').resolves({});
    });
    afterEach(() => {
        sinon.restore();
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    /**
     * Local failover validation function
     *
     * @param {Object}  options                     - function options
     * @param {Integer} [options.localAddresses]    - local addresses to validate against
     * @param {Integer} [options.failoverAddresses] - failover addresses to validate against
     *
     * @returns {Void}
     */
    function validateFailover(options) {
        // process function options
        options = options || {};
        const localAddresses = options.localAddresses || ['1.1.1.1'];
        const failoverAddresses = options.failoverAddresses || ['2.2.2.2'];
        // the updateAddresses function will only be invoked if there are traffic groups in the hostname
        if (spyOnUpdateAddresses.calledTwice) {
            // verify that cloudProvider.updateAddresses method gets called - discover
            const updateAddressesDiscoverCall = spyOnUpdateAddresses.getCall(0).args[0];
            assert.deepStrictEqual(updateAddressesDiscoverCall.localAddresses, localAddresses);
            assert.deepStrictEqual(updateAddressesDiscoverCall.failoverAddresses, failoverAddresses);
            assert.strictEqual(updateAddressesDiscoverCall.discoverOnly, true);

            // verify that cloudProvider.updateRoutes method gets called - discover
            const updateRoutesDiscoverCall = spyOnUpdateRoutes.getCall(0).args[0];
            assert.deepStrictEqual(updateRoutesDiscoverCall.localAddresses, localAddresses);
            assert.strictEqual(updateRoutesDiscoverCall.discoverOnly, true);

            // verify that cloudProvider.updateAddresses method gets called - update
            const updateAddressesUpdateCall = spyOnUpdateAddresses.getCall(1).args[0];
            assert.deepStrictEqual(updateAddressesUpdateCall.updateOperations, {});

            // verify that cloudProvider.updateRoutes method gets called - update
            const updateRoutesUpdateCall = spyOnUpdateRoutes.getCall(1).args[0];
            assert.deepStrictEqual(updateRoutesUpdateCall.updateOperations, {});
        } else {
            // verify that cloudProvider.updateAddresses method gets called - update
            const updateAddressesUpdateCall = spyOnUpdateAddresses.getCall(0).args[0];
            // verify that cloudProvider.updateRoutes method gets called - update
            const updateRoutesUpdateCall = spyOnUpdateRoutes.getCall(0).args[0];
            if (updateAddressesUpdateCall.updateOperations !== undefined
                && updateRoutesUpdateCall.updateOperations !== undefined) {
                assert.deepStrictEqual(updateRoutesUpdateCall.updateOperations, {});
                assert.deepStrictEqual(updateAddressesUpdateCall.updateOperations, {});
            }
        }
    }

    it('should execute failover', () => config.init(restWorker)
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.execute())
        .then(() => {
            validateFailover();
        })
        .catch(err => Promise.reject(err)));

    it('should execute failover with retry', () => {
        // ensure RUN then PASS results in successful failover operation
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.RUN });
        downloadDataFromStorageMock.onCall(1).resolves({ taskState: constants.FAILOVER_STATES.PASS });

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                validateFailover();
            })
            .catch(err => Promise.reject(err));
    });

    it('should result in no failover addresses when no virtual addresses exist', () => {
        deviceGetVirtualAddressesMock.returns([]);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: [] });
            });
    });

    it('should result in no failover addresses when the device has no matching traffic groups', () => {
        deviceGetTrafficGroupsMock.returns({
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
        });

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: [] });
            });
    });

    it('should result in no failover addresses when device hostname does not match any traffic groups', () => {
        deviceGlobalSettingsMock.returns({ hostname: 'some_other_hostname' });

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: [] });
            });
    });

    it('should recover from a previous failover failure', () => {
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
        setConfigSpy = sinon.stub(Object.getPrototypeOf(config), 'setConfig').resolves();
        setTaskStateSpy = sinon.stub(Object.getPrototypeOf(config), 'setTaskState').resolves();

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                // verify that the uploaded task state is running and then eventually succeeded
                assert.strictEqual(uploadDataToStorageSpy.getCall(0).args[1].taskState, constants.FAILOVER_STATES.RUN);
                assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
                assert.strictEqual(setConfigSpy.getCall(0).lastArg.environment, 'azure');
                assert.strictEqual(setTaskStateSpy.lastCall.lastArg.message, 'Failover Completed Successfully');
            })
            .catch(err => Promise.reject(err));
    });

    it('should failover virtual addresses in non Common partitions', () => {
        deviceGetVirtualAddressesMock.returns([
            {
                address: '2.2.2.2',
                trafficGroup: 'some_trafficGroup',
                parition: 'Common'
            },
            {
                address: '3.3.3.3',
                trafficGroup: 'some_trafficGroup',
                parition: 'Tenant_01'
            }
        ]);

        return config.init(restWorker)
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: ['2.2.2.2', '3.3.3.3'] });
            })
            .catch(err => Promise.reject(err));
    });

    it('should reject when an error occurs during failover execution', () => {
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

    it('should reject when enviroment is not provided during failover execution', () => {
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

    it('should reset state file when reset state file function is called after config declaration has occurred', () => config.init(restWorker)
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.resetFailoverState({ resetStateFile: true }))
        .then(() => {
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].message, constants.STATE_FILE_RESET_MESSAGE);
            assert.deepStrictEqual(uploadDataToStorageSpy.lastCall.args[1].failoverOperations, {});
        })
        .catch(err => Promise.reject(err)));

    it('should reset state file when reset state file function is called before declaration', () => failover.resetFailoverState({ resetStateFile: true })
        .then(() => {
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].message, constants.STATE_FILE_RESET_MESSAGE);
            assert.deepStrictEqual(uploadDataToStorageSpy.lastCall.args[1].failoverOperations, {});
        })
        .catch(err => Promise.reject(err)));

    it('should not reset state file when reset state file key is set to false', () => config.init(restWorker)
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.resetFailoverState({ resetStateFile: false }))
        .then(() => {
            assert(uploadDataToStorageSpy.notCalled);
        })
        .catch(err => Promise.reject(err)));
});
