/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon');

const constants = require('../constants.js');
const util = require('../shared/util.js');

const declaration = constants.declarations.basic;


/* eslint-disable global-require */

describe('Failover', () => {
    let config;
    let Device;
    let CloudFactory;
    let FailoverClient;
    let TelemetryClient;
    let failover;

    let deviceGlobalSettingsMock;
    let deviceGetTrafficGroupsMock;
    let deviceGetSelfAddressesMock;
    let deviceGetVirtualAddressesMock;
    let deviceGetNatAddressesMock;
    let deviceGetSnatTranslationAddressesMock;
    let deviceGetCMDeviceInfoMock;
    let deviceProxySettingsMock;

    let cloudProviderMock;
    let downloadDataFromStorageMock;

    let spyOnUpdateAddresses;
    let spyOnUpdateRoutes;
    let uploadDataToStorageSpy;
    let setConfigSpy;
    let telemetryClientSpy;

    const trafficGroupStatsMockResponse = {
        entries: {
            key01: {
                nestedStats: {
                    entries: {
                        deviceName: { description: 'some_device_name' },
                        failoverState: { description: 'active' },
                        trafficGroup: { description: 'traffic-group-1' }
                    }
                }
            }
        }
    };
    const cmDeviceInfoMockResponse = [
        {
            name: 'some_device_name',
            selfDevice: 'true'
        }
    ];

    beforeEach(() => {
        config = require('../../src/nodejs/config.js');
        Device = require('../../src/nodejs/device.js');
        CloudFactory = require('../../src/nodejs/providers/cloudFactory.js');
        FailoverClient = require('../../src/nodejs/failover.js').FailoverClient;
        TelemetryClient = require('../../src/nodejs/telemetry.js').TelemetryClient;

        sinon.stub(Device.prototype, 'init').resolves();
        sinon.stub(Device.prototype, 'executeBigIpBashCmd').resolves('');
        sinon.stub(Device.prototype, 'getDataGroups').resolves(util.createDataGroupObject(declaration));
        sinon.stub(Device.prototype, 'createDataGroup').resolves(util.createDataGroupObject(declaration));
        deviceGlobalSettingsMock = sinon.stub(Device.prototype, 'getGlobalSettings');
        deviceGetTrafficGroupsMock = sinon.stub(Device.prototype, 'getTrafficGroupsStats');
        deviceGetSelfAddressesMock = sinon.stub(Device.prototype, 'getSelfAddresses');
        deviceGetVirtualAddressesMock = sinon.stub(Device.prototype, 'getVirtualAddresses');
        deviceGetSnatTranslationAddressesMock = sinon.stub(Device.prototype, 'getSnatTranslationAddresses');
        deviceGetNatAddressesMock = sinon.stub(Device.prototype, 'getNatAddresses');
        deviceGetCMDeviceInfoMock = sinon.stub(Device.prototype, 'getCMDeviceInfo');
        deviceProxySettingsMock = sinon.stub(Device.prototype, 'getProxySettings');

        cloudProviderMock = {
            init: () => Promise.resolve({}),
            updateAddresses: () => Promise.resolve({}),
            updateRoutes: () => Promise.resolve({}),
            downloadDataFromStorage: () => Promise.resolve({}),
            uploadDataToStorage: () => Promise.resolve({}),
            getAssociatedAddressAndRouteInfo: () => Promise.resolve({ routes: [], addresses: [] }),
            configureProxy: () => Promise.resolve({})
        };

        downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.PASS });
        spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');
        spyOnUpdateRoutes = sinon.spy(cloudProviderMock, 'updateRoutes');
        sinon.stub(CloudFactory, 'getCloudProvider').returns(cloudProviderMock);
        telemetryClientSpy = sinon.stub(TelemetryClient.prototype, 'send').resolves();

        deviceGlobalSettingsMock.returns({ hostname: 'some_hostname' });
        deviceGetTrafficGroupsMock.returns(trafficGroupStatsMockResponse);
        deviceGetCMDeviceInfoMock.returns(cmDeviceInfoMockResponse);

        deviceGetSelfAddressesMock.returns([
            {
                name: 'traffic-group-1',
                address: '1.1.1.1',
                trafficGroup: 'local_only'
            }
        ]);
        deviceGetVirtualAddressesMock.returns([
            {
                address: '2.2.2.2',
                trafficGroup: 'traffic-group-1',
                partition: 'Common'
            }
        ]);
        deviceGetSnatTranslationAddressesMock.returns([]);
        deviceGetNatAddressesMock.returns([]);
        deviceProxySettingsMock.returns({});

        uploadDataToStorageSpy = sinon.stub(cloudProviderMock, 'uploadDataToStorage').resolves({});

        failover = new FailoverClient();
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
        // if options does not specify isAddressOperationsEnabled or isRouteOperationsEnabled,
        // then assign it to be true to enabled testing failover ip addresses and routes
        const isAddressOperationsEnabled = options.isAddressOperationsEnabled !== false;
        const isRouteOperationsEnabled = options.isRouteOperationsEnabled !== false;

        if (isAddressOperationsEnabled) {
            // the updateAddresses function will only be invoked if there are traffic groups in the hostname
            // verify that cloudProvider.updateAddresses method gets called - discover
            const updateAddressesDiscoverCall = spyOnUpdateAddresses.getCall(0).args[0];
            assert.deepStrictEqual(updateAddressesDiscoverCall.localAddresses, localAddresses);
            assert.deepStrictEqual(updateAddressesDiscoverCall.failoverAddresses, failoverAddresses);
            assert.strictEqual(updateAddressesDiscoverCall.discoverOnly, true);

            // verify that cloudProvider.updateAddresses method gets called - update
            const updateAddressesUpdateCall = spyOnUpdateAddresses.getCall(1).args[0];
            assert.deepStrictEqual(updateAddressesUpdateCall.updateOperations, {});
        }

        if (isRouteOperationsEnabled) {
            // verify that cloudProvider.updateRoutes method gets called - discover
            const updateRoutesDiscoverCall = spyOnUpdateRoutes.getCall(0).args[0];
            assert.deepStrictEqual(updateRoutesDiscoverCall.localAddresses, localAddresses);
            assert.strictEqual(updateRoutesDiscoverCall.discoverOnly, true);

            // verify that cloudProvider.updateRoutes method gets called - update
            const updateRoutesUpdateCall = spyOnUpdateRoutes.getCall(1).args[0];
            assert.deepStrictEqual(updateRoutesUpdateCall.updateOperations, {});
        }
    }

    /**
     * Validate route properties
     *
     * @param {Object}  spy              - function options
     * @param {Integer} localDeclaration - local addresses to validate against
     * @param {Integer} range            - failover addresses to validate against
     *
     * @returns {Void}
     */
    function validateRouteProperties(spy, localDeclaration, range) {
        const callArg = spy.lastCall.lastArg;
        // check scoping name
        assert.deepStrictEqual(
            callArg.routeGroupDefinitions[0].routeName,
            localDeclaration.failoverRoutes.routeGroupDefinitions[0].scopingName
        );
        // check scoping address ranges
        assert.deepStrictEqual(
            callArg.routeGroupDefinitions[0].routeAddressRanges[0].routeAddresses,
            range
        );
        // check next hop address items
        assert.deepStrictEqual(
            callArg.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses.items,
            localDeclaration.failoverRoutes.routeGroupDefinitions[0].defaultNextHopAddresses.items
        );
    }

    it('should execute failover', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.execute())
        .then(() => {
            validateFailover();
        })
        .catch(err => Promise.reject(err)));

    it('should execute failover with only ip address enabled', () => config.init()
        .then(() => {
            const decl = util.deepCopy(declaration);
            // disable routes failover
            decl.failoverRoutes.enabled = false;
            config.processConfigRequest(decl);
        })
        .then(() => failover.init())
        .then(() => failover.execute())
        .then(() => {
            validateFailover({ isRouteOperationsEnabled: false });
            assert.deepStrictEqual(spyOnUpdateRoutes.notCalled, true);
        })
        .catch(err => Promise.reject(err)));

    it('should execute failover with only route enabled', () => config.init()
        .then(() => {
            const decl = util.deepCopy(declaration);
            // disable ip address failover
            decl.failoverAddresses.enabled = false;
            config.processConfigRequest(decl);
        })
        .then(() => failover.init())
        .then(() => failover.execute())
        .then(() => {
            validateFailover({ isAddressOperationsEnabled: false });
            assert.deepStrictEqual(spyOnUpdateAddresses.notCalled, true);
            assert.deepStrictEqual(spyOnUpdateRoutes.calledTwice, true);
        })
        .catch(err => Promise.reject(err)));

    it('should not update ip addresses and routes when disabled', () => config.init()
        .then(() => {
            const decl = util.deepCopy(declaration);
            // disable ip address failover
            decl.failoverAddresses.enabled = false;
            decl.failoverRoutes.enabled = false;
            config.processConfigRequest(decl);
        })
        .then(() => failover.init())
        .then(() => failover.execute())
        .then(() => {
            validateFailover({ isAddressOperationsEnabled: false, isRouteOperationsEnabled: false });
            assert.deepStrictEqual(spyOnUpdateAddresses.notCalled, true);
            assert.deepStrictEqual(spyOnUpdateRoutes.notCalled, true);
        })
        .catch(err => Promise.reject(err)));

    it('should execute failover with retry', () => {
        // ensure RUN then PASS results in successful failover operation
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.RUN });
        downloadDataFromStorageMock.onCall(1).resolves({ taskState: constants.FAILOVER_STATES.PASS });

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                validateFailover();
            })
            .catch(err => Promise.reject(err));
    });

    it('should execute failover with virtual and snat addresses', () => {
        deviceGetSnatTranslationAddressesMock.returns([
            {
                address: '2.2.2.3',
                trafficGroup: 'traffic-group-1',
                partition: 'Common'
            }
        ]);

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: ['2.2.2.2', '2.2.2.3'] });
            })
            .catch(err => Promise.reject(err));
    });

    it('should execute failover with virtual, snat and nat addresses', () => {
        deviceGetSnatTranslationAddressesMock.returns([
            {
                address: '2.2.2.3',
                trafficGroup: 'traffic-group-1',
                partition: 'Common'
            }
        ]);
        deviceGetNatAddressesMock.returns([
            {
                originatingAddress: '1.1.1.4',
                translationAddress: '2.2.2.4',
                trafficGroup: 'traffic-group-1',
                partition: 'Common'
            }
        ]);

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: ['2.2.2.2', '2.2.2.3', '2.2.2.4'] });
            })
            .catch(err => Promise.reject(err));
    });

    it('should result in no failover addresses when no virtual addresses exist', () => {
        deviceGetVirtualAddressesMock.returns([]);

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
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
                            deviceName: { description: 'some_device_name' },
                            failoverState: { description: 'active' },
                            trafficGroup: { description: 'some-other-traffic-group' }
                        }
                    }
                }
            }
        });

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: [] });
            });
    });

    it('should result in no failover addresses when device hostname does not match any traffic groups', () => {
        deviceGlobalSettingsMock.returns({ hostname: 'some_other_hostname' });

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .catch(err => Promise.reject(err));
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

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                // verify that the uploaded task state is running and then eventually succeeded
                assert.strictEqual(uploadDataToStorageSpy.getCall(0).args[1].taskState, constants.FAILOVER_STATES.RUN);
                assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
                assert.strictEqual(setConfigSpy.getCall(0).lastArg.environment, 'azure');
                assert.strictEqual(uploadDataToStorageSpy.lastCall.lastArg.message, 'Failover Complete');
            })
            .catch(err => Promise.reject(err));
    });

    it('should failover virtual addresses in non Common partitions', () => {
        deviceGetVirtualAddressesMock.returns([
            {
                address: '2.2.2.2',
                trafficGroup: 'traffic-group-1',
                parition: 'Common'
            },
            {
                address: '3.3.3.3',
                trafficGroup: 'traffic-group-1',
                parition: 'Tenant_01'
            }
        ]);

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: ['2.2.2.2', '3.3.3.3'] });
            })
            .catch(err => Promise.reject(err));
    });

    it('should reject when an error occurs during failover execution', () => {
        deviceGlobalSettingsMock.returns();

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
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

        return failover.init()
            .then(() => failover.execute())
            .then(() => {
                assert.fail();
            })
            .catch(() => {
                // fails when error recieved
                assert.ok(true);
            });
    });

    it('should reset state file when reset state file function is called after config declaration has occurred', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.resetFailoverState({ resetStateFile: true }))
        .then(() => {
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].message, constants.STATE_FILE_RESET_MESSAGE);
            assert.deepStrictEqual(uploadDataToStorageSpy.lastCall.args[1].failoverOperations, {});
        })
        .catch(err => Promise.reject(err)));

    it('should reset state file when reset state file function is called before declaration', () => failover.init()
        .then(() => failover.resetFailoverState({ resetStateFile: true }))
        .then(() => {
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].message, constants.STATE_FILE_RESET_MESSAGE);
            assert.deepStrictEqual(uploadDataToStorageSpy.lastCall.args[1].failoverOperations, {});
        })
        .catch(err => Promise.reject(err)));

    it('should not reset state file when reset state file key is set to false', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.resetFailoverState({ resetStateFile: false }))
        .then(() => {
            assert(uploadDataToStorageSpy.notCalled);
        })
        .catch(err => Promise.reject(err)));

    it('should retrieve a task state of "pass"', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.getTaskStateFile())
        .then((result) => {
            assert.strictEqual(result.taskState, constants.FAILOVER_STATES.PASS);
        })
        .catch(err => Promise.reject(err)));

    it('should retrieve a task state of "never run"', () => {
        downloadDataFromStorageMock.onCall(0).resolves({});

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.getTaskStateFile())
            .then((result) => {
                assert.strictEqual(result.taskState, constants.FAILOVER_STATES.NEVER_RUN);
            })
            .catch(err => Promise.reject(err));
    });

    it('should get current HA status and mapped cloud objects', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.getFailoverStatusAndObjects())
        .then((data) => {
            assert.deepStrictEqual({
                routes: [],
                addresses: [],
                hostName: 'some_hostname',
                deviceStatus: 'active',
                trafficGroup: [
                    {
                        name: 'traffic-group-1'
                    }
                ]
            }, data);
        }));

    it('should reject with a helpful error message on empty recovery operations', () => {
        downloadDataFromStorageMock.onCall(0).resolves({
            taskState: constants.FAILOVER_STATES.FAIL,
            failoverOperations: {
                addresses: null,
                routes: null
            }

        });

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                assert.fail('Expected error');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'Recovery operations are empty, advise reset via the API');
            });
    });

    it('should parse config for default next hop addresses', () => {
        const defaultNextHopAddressDeclaration = {
            class: 'Cloud_Failover',
            environment: 'azure',
            failoverRoutes: {
                scopingTags: {
                    f5_cloud_failover_label: 'mydeployment'
                },
                scopingAddressRanges: [
                    {
                        range: '192.168.1.0/24'
                    },
                    {
                        range: '192.168.1.0/24',
                        nextHopAddresses: {
                            discoveryType: 'static',
                            items: [
                                '192.0.2.10',
                                '192.0.2.11'
                            ]
                        }
                    }
                ],
                defaultNextHopAddresses: {
                    discoveryType: 'static',
                    items: [
                        '192.0.2.10',
                        '192.0.2.11'
                    ]
                }
            }
        };
        const spyOnCloudProviderInit = sinon.spy(cloudProviderMock, 'init');

        return config.init()
            .then(() => config.processConfigRequest(defaultNextHopAddressDeclaration))
            .then(() => failover.init())
            .then(() => {
                const callArg = spyOnCloudProviderInit.lastCall.lastArg;
                assert(callArg.routeGroupDefinitions[0].routeAddressRanges[0].routeAddresses
                    === defaultNextHopAddressDeclaration.failoverRoutes.scopingAddressRanges[0].range);
                assert(callArg.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses.type
                    === defaultNextHopAddressDeclaration.failoverRoutes.defaultNextHopAddresses.discoveryType);
                assert(callArg.routeGroupDefinitions[0].routeAddressRanges[1].routeAddresses
                    === defaultNextHopAddressDeclaration.failoverRoutes.scopingAddressRanges[1].range);
                assert(callArg.routeGroupDefinitions[0].routeAddressRanges[1].routeNextHopAddresses.type
                    === defaultNextHopAddressDeclaration.failoverRoutes.scopingAddressRanges[1]
                        .nextHopAddresses.discoveryType);
            })
            .catch(err => Promise.reject(err));
    });

    it('should parse global route config into a single route group definition', () => {
        const localDeclaration = {
            class: 'Cloud_Failover',
            environment: 'azure',
            failoverAddresses: {
                enabled: true,
                scopingTags: {
                    f5_cloud_failover_label: 'test'
                }
            },
            failoverRoutes: {
                enabled: true,
                scopingTags: {
                    f5_cloud_failover_label: 'mydeployment'
                },
                scopingAddressRanges: [
                    {
                        range: '192.168.1.0/24'
                    }
                ],
                defaultNextHopAddresses: {
                    discoveryType: 'static',
                    items: [
                        '192.0.2.10',
                        '192.0.2.11'
                    ]
                }
            }
        };
        const spyOnCloudProviderInit = sinon.spy(cloudProviderMock, 'init');

        return config.init()
            .then(() => config.processConfigRequest(localDeclaration))
            .then(() => failover.init())
            .then(() => {
                const callArg = spyOnCloudProviderInit.lastCall.lastArg;
                // check scoping tags
                assert.deepStrictEqual(
                    callArg.routeGroupDefinitions[0].routeTags,
                    localDeclaration.failoverRoutes.scopingTags
                );
                // check scoping address ranges
                assert.deepStrictEqual(
                    callArg.routeGroupDefinitions[0].routeAddressRanges[0].routeAddresses,
                    localDeclaration.failoverRoutes.scopingAddressRanges[0].range
                );
                // check next hop address items
                assert.deepStrictEqual(
                    callArg.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses.items,
                    localDeclaration.failoverRoutes.defaultNextHopAddresses.items
                );
            })
            .catch(err => Promise.reject(err));
    });

    it('should parse config for specific route group definitions', () => {
        const localDeclaration = {
            class: 'Cloud_Failover',
            environment: 'azure',
            failoverAddresses: {
                enabled: true,
                scopingTags: {
                    f5_cloud_failover_label: 'test'
                }
            },
            failoverRoutes: {
                enabled: true,
                routeGroupDefinitions: [
                    {
                        scopingName: 'route-1',
                        scopingAddressRanges: [
                            {
                                range: '192.0.2.0/24'
                            }
                        ],
                        defaultNextHopAddresses: {
                            discoveryType: 'static',
                            items: [
                                '192.0.2.10',
                                '192.0.2.11'
                            ]
                        }
                    }
                ]
            }
        };
        const spyOnCloudProviderInit = sinon.spy(cloudProviderMock, 'init');

        return config.init()
            .then(() => config.processConfigRequest(localDeclaration))
            .then(() => failover.init())
            .then(() => {
                validateRouteProperties(spyOnCloudProviderInit, localDeclaration, '192.0.2.0/24');
            })
            .catch(err => Promise.reject(err));
    });

    it('should parse config for route group definitions without scoping address ranges', () => {
        const localDeclaration = {
            class: 'Cloud_Failover',
            environment: 'azure',
            failoverAddresses: {
                enabled: true,
                scopingTags: {
                    f5_cloud_failover_label: 'test'
                }
            },
            failoverRoutes: {
                enabled: true,
                routeGroupDefinitions: [
                    {
                        scopingName: 'route-1',
                        defaultNextHopAddresses: {
                            discoveryType: 'static',
                            items: [
                                '192.0.2.10',
                                '192.0.2.11'
                            ]
                        }
                    }
                ]
            }
        };
        const spyOnCloudProviderInit = sinon.spy(cloudProviderMock, 'init');

        return config.init()
            .then(() => config.processConfigRequest(localDeclaration))
            .then(() => failover.init())
            .then(() => {
                validateRouteProperties(spyOnCloudProviderInit, localDeclaration, 'all');
            })
            .catch(err => Promise.reject(err));
    });

    it('should send telemetry on failover success', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.execute({ callerAttributes: { endpoint: '/declare', httpMethod: 'POST' } }))
        .then(() => {
            assert.strictEqual(telemetryClientSpy.called, true);
            const callArg = telemetryClientSpy.getCall(0).lastArg;
            assert.strictEqual(callArg.product.environment, 'azure');
            assert.strictEqual(callArg.operation.result, 'SUCCEEDED');
            assert.strictEqual(callArg.operation.resultSummary, 'Failover Successful');
        })
        .catch(err => Promise.reject(err)));

    it('should send telemetry on failover failure', () => {
        spyOnUpdateAddresses.restore();
        sinon.stub(cloudProviderMock, 'updateAddresses').throws('failover failed');
        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute({ callerAttributes: { endpoint: '/declare', httpMethod: 'POST' } }))
            .catch(() => {
                assert.strictEqual(telemetryClientSpy.called, true);
                const callArg = telemetryClientSpy.getCall(0).lastArg;
                assert.strictEqual(callArg.product.environment, 'azure');
                assert.strictEqual(callArg.operation.result, 'FAILED');
            });
    });
});
