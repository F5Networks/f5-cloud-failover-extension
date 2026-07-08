/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
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
    let spyOnDiscoverAddresses;
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
            getRegion: () => Promise.resolve(),
            updateAddresses: () => Promise.resolve({}),
            discoverAddresses: () => Promise.resolve({}),
            updateRoutes: () => Promise.resolve({}),
            downloadDataFromStorage: () => Promise.resolve({}),
            discoverAddressUsingProvidedDefinition: () => [],
            uploadDataToStorage: () => Promise.resolve({}),
            getAssociatedAddressAndRouteInfo: () => Promise.resolve({ routes: [], addresses: [] }),
            configureProxy: () => Promise.resolve({})
        };

        downloadDataFromStorageMock = sinon.stub(cloudProviderMock, 'downloadDataFromStorage');
        downloadDataFromStorageMock.onCall(0).resolves({ taskState: constants.FAILOVER_STATES.PASS });
        spyOnUpdateAddresses = sinon.spy(cloudProviderMock, 'updateAddresses');
        spyOnDiscoverAddresses = sinon.spy(cloudProviderMock, 'discoverAddresses');
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
            const discoverAddressesCall = spyOnDiscoverAddresses.getCall(0).args[0];
            assert.deepStrictEqual(discoverAddressesCall.localAddresses, localAddresses);
            assert.deepStrictEqual(discoverAddressesCall.failoverAddresses, failoverAddresses);

            // verify that cloudProvider.updateAddresses method gets called - update
            const updateAddressesUpdateCall = spyOnUpdateAddresses.getCall(0).args[0];
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
        .catch((err) => Promise.reject(err)));

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
        .catch((err) => Promise.reject(err)));

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
        .catch((err) => Promise.reject(err)));

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
        .catch((err) => Promise.reject(err)));

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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
    });

    it('should execute get failover discovery for dry run', () => {
        sinon.stub(FailoverClient.prototype, '_normalizeOperations').resolves();
        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.dryRun())
            .then(() => {
                const discoverAddressesCall = spyOnDiscoverAddresses.getCall(0).args[0];
                // verify that update addresses get called
                assert.deepStrictEqual(discoverAddressesCall.localAddresses, ['1.1.1.1']);
                assert.deepStrictEqual(discoverAddressesCall.failoverAddresses, ['2.2.2.2']);

                // verify that update routes get called
                const updateRoutesUpdateCall = spyOnUpdateRoutes.getCall(0).args[0];
                assert.strictEqual(updateRoutesUpdateCall.discoverOnly, true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should execute normalize operations for dry run in AWS', () => {
        sinon.stub(failover, '_getFailoverDiscovery').resolves(
            [
                {
                    publicAddresses: {},
                    interfaces: {
                        disassociate: [
                            {
                                networkInterfaceId: 'eni-0b9b1aa42dd867b69',
                                addresses: []
                            },
                            {
                                networkInterfaceId: 'eni-077275f96f490adbd',
                                addresses: [
                                    {
                                        address: '2600:1f14:277f:b103::a',
                                        ipVersion: 6
                                    },
                                    {
                                        address: '10.0.1.203',
                                        publicAddress: '34.208.65.106',
                                        ipVersion: 4
                                    }
                                ]
                            }
                        ],
                        associate: [
                            {
                                networkInterfaceId: 'eni-0cb18ea00cf03ab35',
                                addresses: []
                            },
                            {
                                networkInterfaceId: 'eni-0604b93114a086354',
                                addresses: [
                                    {
                                        address: '2600:1f14:277f:b103::a',
                                        ipVersion: 6
                                    },
                                    {
                                        address: '10.0.1.203',
                                        publicAddress: '34.208.65.106',
                                        ipVersion: 4
                                    }
                                ]
                            }
                        ]
                    },
                    loadBalancerAddresses: {}
                },
                {
                    operations: [
                        {
                            routeTableId: 'rtb-07a2a947b5d26385b',
                            networkInterfaceId: 'eni-0604b93114a086354',
                            routeAddress: '192.0.10.0/32',
                            ipVersion: 4
                        }
                    ]
                }
            ]
        );
        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.config.environment = 'aws';
            })
            .then(() => failover.dryRun())
            .then((output) => {
                assert.strictEqual(output[0].operations.toStandby[0].networkInterface, 'eni-0b9b1aa42dd867b69');
                assert.strictEqual(output[0].operations.toStandby[1].networkInterface, 'eni-077275f96f490adbd');
                assert.strictEqual(output[0].operations.toActive[0].networkInterface, 'eni-0cb18ea00cf03ab35');
                assert.strictEqual(output[0].operations.toActive[1].networkInterface, 'eni-0604b93114a086354');
                assert.strictEqual(output[1].operations[0].route, 'rtb-07a2a947b5d26385b');
                assert.strictEqual(output[1].operations[0].addressPrefix, '192.0.10.0/32');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should execute normalize operations for dry run in Azure', () => {
        sinon.stub(failover, '_getFailoverDiscovery').resolves(
            [
                {
                    publicAddresses: [],
                    interfaces: {
                        disassociate: [
                            [
                                'azure-111-cd9i47s4',
                                'azure-111-cd9i47s4-ext1',
                                {
                                    name: 'azure-111-cd9i47s4-ext1',
                                    id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkInterfaces/azure-111-cd9i47s4-ext1',
                                    tags: {
                                        f5_cloud_failover_label: 'azure-111-cd9i47s4',
                                        f5_cloud_failover_nic_map: 'external'
                                    },
                                    properties: {
                                        provisioningState: 'Succeeded',
                                        resourceGuid: '797793fb-674c-4bd7-8ef4-fa44a34d918b',
                                        ipConfigurations: [
                                            {
                                                name: 'azure-111-cd9i47s4-ext1',
                                                id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkInterfaces/azure-111-cd9i47s4-ext1/ipConfigurations/azure-111-cd9i47s4-ext1',
                                                type: 'Microsoft.Network/networkInterfaces/ipConfigurations',
                                                properties: {
                                                    provisioningState: 'Succeeded',
                                                    privateIPAddress: '10.0.2.5',
                                                    privateIPAllocationMethod: 'Static',
                                                    subnet: {
                                                        id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/virtualNetworks/azure-111-cd9i47s4-network/subnets/external'
                                                    },
                                                    primary: true,
                                                    privateIPAddressVersion: 'IPv4'
                                                }
                                            }
                                        ],
                                        dnsSettings: {
                                            dnsServers: [],
                                            appliedDnsServers: [],
                                            internalDomainNameSuffix: 'ttskpj0m4ccepddgoujw5wizug.bx.internal.cloudapp.net'
                                        },
                                        macAddress: '00-22-48-1C-95-97',
                                        enableAcceleratedNetworking: false,
                                        vnetEncryptionSupported: false,
                                        enableIPForwarding: false,
                                        disableTcpStateTracking: false,
                                        networkSecurityGroup: {
                                            id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkSecurityGroups/azure-111-cd9i47s4-sg'
                                        },
                                        primary: false,
                                        virtualMachine: {
                                            id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Compute/virtualMachines/azure-111-cd9i47s4-vm1'
                                        },
                                        hostedWorkloads: [],
                                        tapConfigurations: [],
                                        nicType: 'Standard',
                                        allowPort25Out: true,
                                        auxiliaryMode: 'None',
                                        auxiliarySku: 'None'
                                    },
                                    type: 'Microsoft.Network/networkInterfaces',
                                    location: 'eastus',
                                    kind: 'Regular'
                                },
                                'Disassociate'
                            ]
                        ],
                        associate: [
                            [
                                'azure-111-cd9i47s4',
                                'azure-111-cd9i47s4-ext0',
                                {
                                    name: 'azure-111-cd9i47s4-ext0',
                                    id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkInterfaces/azure-111-cd9i47s4-ext0',
                                    tags: {
                                        f5_cloud_failover_label: 'azure-111-cd9i47s4',
                                        f5_cloud_failover_nic_map: 'external'
                                    },
                                    properties: {
                                        provisioningState: 'Succeeded',
                                        resourceGuid: '57c1b742-c873-4fec-a6ca-20b24d125b57',
                                        ipConfigurations: [
                                            {
                                                name: 'azure-111-cd9i47s4-ext0',
                                                id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkInterfaces/azure-111-cd9i47s4-ext0/ipConfigurations/azure-111-cd9i47s4-ext0',
                                                type: 'Microsoft.Network/networkInterfaces/ipConfigurations',
                                                properties: {
                                                    provisioningState: 'Succeeded',
                                                    privateIPAddress: '10.0.2.4',
                                                    privateIPAllocationMethod: 'Static',
                                                    subnet: {
                                                        id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/virtualNetworks/azure-111-cd9i47s4-network/subnets/external'
                                                    },
                                                    primary: true,
                                                    privateIPAddressVersion: 'IPv4'
                                                }
                                            },
                                            {
                                                name: 'azure-111-cd9i47s4-secondary-vip1',
                                                id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkInterfaces/azure-111-cd9i47s4-ext1/ipConfigurations/azure-111-cd9i47s4-secondary-vip1',
                                                type: 'Microsoft.Network/networkInterfaces/ipConfigurations',
                                                properties: {
                                                    provisioningState: 'Succeeded',
                                                    privateIPAddress: '10.0.2.6',
                                                    privateIPAllocationMethod: 'Static',
                                                    subnet: {
                                                        id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/virtualNetworks/azure-111-cd9i47s4-network/subnets/external'
                                                    },
                                                    primary: false,
                                                    privateIPAddressVersion: 'IPv4'
                                                }
                                            }
                                        ],
                                        dnsSettings: {
                                            dnsServers: [],
                                            appliedDnsServers: [],
                                            internalDomainNameSuffix: 'ttskpj0m4ccepddgoujw5wizug.bx.internal.cloudapp.net'
                                        },
                                        macAddress: '60-45-BD-D6-A2-90',
                                        enableAcceleratedNetworking: false,
                                        vnetEncryptionSupported: false,
                                        enableIPForwarding: false,
                                        disableTcpStateTracking: false,
                                        networkSecurityGroup: {
                                            id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/networkSecurityGroups/azure-111-cd9i47s4-sg'
                                        },
                                        primary: false,
                                        virtualMachine: {
                                            id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Compute/virtualMachines/azure-111-cd9i47s4-vm0'
                                        },
                                        hostedWorkloads: [],
                                        tapConfigurations: [],
                                        nicType: 'Standard',
                                        allowPort25Out: true,
                                        auxiliaryMode: 'None',
                                        auxiliarySku: 'None'
                                    },
                                    type: 'Microsoft.Network/networkInterfaces',
                                    location: 'eastus',
                                    kind: 'Regular'
                                },
                                'Associate'
                            ]
                        ]
                    },
                    loadBalancerAddresses: {}
                },
                {
                    operations: [
                        [
                            'azure-111-cd9i47s4',
                            'azure-111-cd9i47s4-rt',
                            'route1',
                            {
                                name: 'route1',
                                id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/routeTables/azure-111-cd9i47s4-rt/routes/route1',
                                properties: {
                                    provisioningState: 'Succeeded',
                                    addressPrefix: '192.0.2.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.5',
                                    hasBgpOverride: false
                                },
                                type: 'Microsoft.Network/routeTables/routes',
                                nextHopIpAddress: '10.0.1.4'
                            }
                        ],
                        [
                            'azure-111-cd9i47s4',
                            'azure-111-cd9i47s4-rt',
                            'route2',
                            {
                                name: 'route2',
                                id: '/subscriptions/d18b486a-112d-4402-add2-7fb1006f943a/resourceGroups/azure-111-cd9i47s4/providers/Microsoft.Network/routeTables/azure-111-cd9i47s4-rt/routes/route2',
                                properties: {
                                    provisioningState: 'Succeeded',
                                    addressPrefix: '192.0.3.0/24',
                                    nextHopType: 'VirtualAppliance',
                                    nextHopIpAddress: '10.0.1.5',
                                    hasBgpOverride: false
                                },
                                type: 'Microsoft.Network/routeTables/routes',
                                nextHopIpAddress: '10.0.1.4'
                            }
                        ]
                    ]
                }
            ]
        );
        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.dryRun())
            .then((output) => {
                assert.strictEqual(output[0].operations.toStandby[0].networkInterface, 'azure-111-cd9i47s4-ext1');
                assert.strictEqual(output[0].operations.toActive[0].networkInterface, 'azure-111-cd9i47s4-ext0');
                assert.strictEqual(output[1].operations[0].route, 'route1');
                assert.strictEqual(output[1].operations[0].addressPrefix, '192.0.2.0/24');
                assert.strictEqual(output[1].operations[0].nextHopAddress, '10.0.1.4');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should execute normalize operations for dry run in GCP', () => {
        sinon.stub(failover, '_getFailoverDiscovery').resolves(
            [
                {
                    publicAddresses: {},
                    interfaces: {
                        disassociate: [
                            [
                                'tf-func-test-vm02-okq6cmct',
                                'nic0',
                                {
                                    aliasIpRanges: [],
                                    fingerprint: '2qR6-PDRk5o='
                                },
                                {
                                    zone: 'us-west1-b'
                                }
                            ]
                        ],
                        associate: [
                            [
                                'tf-func-test-vm01-okq6cmct',
                                'nic0',
                                {
                                    aliasIpRanges: [
                                        {
                                            ipCidrRange: '10.0.3.4/32'
                                        }
                                    ],
                                    fingerprint: 'bQVhM2BKYjY='
                                },
                                {
                                    zone: 'us-west1-a'
                                }
                            ]
                        ]
                    },
                    loadBalancerAddresses: {
                        operations: [
                            [
                                'gcp-111-tf-func-test-forwarding-rule-us-west1-okq6cmct',
                                'https://www.googleapis.com/compute/v1/projects/f5-7656-pdsoleng-dev/zones/us-west1-a/targetInstances/tf-func-test-target-vm01-okq6cmct'
                            ]
                        ]
                    }
                },
                {
                    operations: [
                        {
                            kind: 'compute#route',
                            id: '3295262323262177568',
                            creationTimestamp: '2023-11-30T13:34:07.933-08:00',
                            name: 'gcp-111-network-route-okq6cmct',
                            network: 'https://www.googleapis.com/compute/v1/projects/f5-7656-pdsoleng-dev/global/networks/gcp-111-int-net-okq6cmct',
                            destRange: '192.0.2.0/24',
                            priority: 100,
                            nextHopIp: '10.0.2.2',
                            selfLink: 'https://www.googleapis.com/compute/v1/projects/f5-7656-pdsoleng-dev/global/routes/gcp-111-network-route-okq6cmct',
                            parsedTags: {
                                f5_cloud_failover_label: 'okq6cmct',
                                f5_self_ips: '10.0.2.2,10.0.2.3'
                            }
                        },
                        {
                            kind: 'compute#route',
                            id: '4864436162523382060',
                            creationTimestamp: '2023-11-30T13:33:55.420-08:00',
                            name: 'gcp-111-network-route-okq6cmct-2',
                            network: 'https://www.googleapis.com/compute/v1/projects/f5-7656-pdsoleng-dev/global/networks/gcp-111-int-net-okq6cmct',
                            destRange: '192.0.3.0/24',
                            priority: 100,
                            nextHopIp: '10.0.2.2',
                            selfLink: 'https://www.googleapis.com/compute/v1/projects/f5-7656-pdsoleng-dev/global/routes/gcp-111-network-route-okq6cmct-2',
                            parsedTags: {
                                f5_cloud_failover_label: 'okq6cmct',
                                f5_self_ips: '10.0.2.2,10.0.2.3'
                            }
                        }
                    ]
                }
            ]
        );
        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.config.environment = 'gcp';
            })
            .then(() => failover.dryRun())
            .then((output) => {
                assert.strictEqual(output[0].operations.toStandby[0].networkInterface, 'nic0');
                assert.strictEqual(output[0].operations.toActive[0].networkInterface, 'nic0');
                assert.strictEqual(output[0].operations.toActive[0].aliasIpRanges[0].ipCidrRange, '10.0.3.4/32');
                assert.strictEqual(output[0].loadBalancerAddresses.operations[0].forwardingRule, 'gcp-111-tf-func-test-forwarding-rule-us-west1-okq6cmct');
                assert.strictEqual(output[0].loadBalancerAddresses.operations[0].targetInstance, 'https://www.googleapis.com/compute/v1/projects/f5-7656-pdsoleng-dev/zones/us-west1-a/targetInstances/tf-func-test-target-vm01-okq6cmct');
                assert.strictEqual(output[1].operations[0].route, 'gcp-111-network-route-okq6cmct');
                assert.strictEqual(output[1].operations[0].addressPrefix, '192.0.2.0/24');
                assert.strictEqual(output[1].operations[0].nextHopAddress, '10.0.2.2');
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
                assert.strictEqual(setConfigSpy.getCall(0).firstArg.environment, 'azure');
                assert.strictEqual(uploadDataToStorageSpy.lastCall.lastArg.message, 'Failover Complete');
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
        .catch((err) => Promise.reject(err)));

    it('should reset state file when reset state file function is called before declaration', () => failover.init()
        .then(() => failover.resetFailoverState({ resetStateFile: true }))
        .then(() => {
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].taskState, constants.FAILOVER_STATES.PASS);
            assert.strictEqual(uploadDataToStorageSpy.lastCall.args[1].message, constants.STATE_FILE_RESET_MESSAGE);
            assert.deepStrictEqual(uploadDataToStorageSpy.lastCall.args[1].failoverOperations, {});
        })
        .catch((err) => Promise.reject(err)));

    it('should not reset state file when reset state file key is set to false', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.resetFailoverState({ resetStateFile: false }))
        .then(() => {
            assert(uploadDataToStorageSpy.notCalled);
        })
        .catch((err) => Promise.reject(err)));

    it('should retrieve a task state of "pass"', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => failover.init())
        .then(() => failover.getTaskStateFile())
        .then((result) => {
            assert.strictEqual(result.taskState, constants.FAILOVER_STATES.PASS);
        })
        .catch((err) => Promise.reject(err)));

    it('should retrieve a task state of "never run"', () => {
        downloadDataFromStorageMock.onCall(0).resolves({});

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.getTaskStateFile())
            .then((result) => {
                assert.strictEqual(result.taskState, constants.FAILOVER_STATES.NEVER_RUN);
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
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
        .catch((err) => Promise.reject(err)));

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

    it('should execute failover when virtual, snat and self addresses are the same', () => {
        deviceGetSnatTranslationAddressesMock.returns([
            {
                address: '2.2.2.2',
                trafficGroup: 'traffic-group-1',
                partition: 'Common'
            }
        ]);

        deviceGetVirtualAddressesMock.returns([
            {
                address: '2.2.2.2',
                trafficGroup: 'traffic-group-1',
                parition: 'Common'
            }
        ]);
        deviceGetSelfAddressesMock.returns([
            {
                name: 'traffic-group-1',
                address: '2.2.2.2',
                trafficGroup: 'traffic-group-1'
            },
            {
                name: 'traffic-group-1',
                address: '1.1.1.1',
                trafficGroup: 'local_only'
            }
        ]);
        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover.execute())
            .then(() => {
                validateFailover({ failoverAddresses: ['2.2.2.2'], localAddresses: ['1.1.1.1'] });
            })
            .catch((err) => Promise.reject(err));
    });

    describe('setStateFileName', () => {
        it('should set state file name successfully', () => {
            const customFileName = 'custom-state-file.json';
            failover.setStateFileName(customFileName);
            assert.strictEqual(failover.stateFileName, customFileName);
        });

        it('should throw error when state file name is empty string', () => {
            assert.throws(
                () => {
                    failover.setStateFileName('');
                },
                {
                    name: 'Error',
                    message: 'State file name must be a non-empty string'
                }
            );
        });

        it('should throw error when state file name is null', () => {
            assert.throws(
                () => {
                    failover.setStateFileName(null);
                },
                {
                    name: 'Error',
                    message: 'State file name must be a non-empty string'
                }
            );
        });

        it('should throw error when state file name is undefined', () => {
            assert.throws(
                () => {
                    failover.setStateFileName(undefined);
                },
                {
                    name: 'Error',
                    message: 'State file name must be a non-empty string'
                }
            );
        });

        it('should throw error when state file name is not a string', () => {
            assert.throws(
                () => {
                    failover.setStateFileName(12345);
                },
                {
                    name: 'Error',
                    message: 'State file name must be a non-empty string'
                }
            );
        });

        it('should throw error when state file name is an object', () => {
            assert.throws(
                () => {
                    failover.setStateFileName({ name: 'file.json' });
                },
                {
                    name: 'Error',
                    message: 'State file name must be a non-empty string'
                }
            );
        });

        it('should throw error when state file name is an array', () => {
            assert.throws(
                () => {
                    failover.setStateFileName(['file.json']);
                },
                {
                    name: 'Error',
                    message: 'State file name must be a non-empty string'
                }
            );
        });

        it('should accept state file name with extension', () => {
            const fileNameWithExtension = 'my-custom-state.json';
            failover.setStateFileName(fileNameWithExtension);
            assert.strictEqual(failover.stateFileName, fileNameWithExtension);
        });

        it('should accept state file name without extension', () => {
            const fileNameWithoutExtension = 'my-custom-state';
            failover.setStateFileName(fileNameWithoutExtension);
            assert.strictEqual(failover.stateFileName, fileNameWithoutExtension);
        });

        it('should use custom state file name in failover execution', () => {
            const customFileName = 'custom-failover-state.json';
            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => {
                    failover.setStateFileName(customFileName);
                    return failover.execute();
                })
                .then(() => {
                    // Verify uploadDataToStorage was called with custom file name
                    assert.strictEqual(uploadDataToStorageSpy.getCall(0).args[0], customFileName);
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('task state handling', () => {
        it('should reject from getTaskStateFile when download fails', () => {
            downloadDataFromStorageMock.onCall(0).rejects(new Error('download boom'));

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => failover.getTaskStateFile())
                .then(() => {
                    assert.fail('Expected getTaskStateFile to reject');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'download boom');
                });
        });

        it('should not recover when _checkTaskState receives empty state', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                downloadDataFromStorageMock.reset();
                downloadDataFromStorageMock.resolves({});
                return failover._checkTaskState();
            })
            .then((result) => {
                assert.strictEqual(result.recoverPreviousTask, false);
            })
            .catch((err) => Promise.reject(err)));

        it('should not recover when _checkTaskState receives undefined state', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                downloadDataFromStorageMock.reset();
                downloadDataFromStorageMock.resolves(undefined);
                return failover._checkTaskState();
            })
            .then((result) => {
                assert.strictEqual(result.recoverPreviousTask, false);
            })
            .catch((err) => Promise.reject(err)));

        it('should not recover when _checkTaskState state is NEVER_RUN', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                downloadDataFromStorageMock.reset();
                downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.NEVER_RUN });
                return failover._checkTaskState();
            })
            .then((result) => {
                assert.strictEqual(result.recoverPreviousTask, false);
                assert.strictEqual(result.state.taskState, constants.FAILOVER_STATES.NEVER_RUN);
            })
            .catch((err) => Promise.reject(err)));

        it('should recover when _checkTaskState state is FAIL', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                downloadDataFromStorageMock.reset();
                downloadDataFromStorageMock.resolves({ taskState: constants.FAILOVER_STATES.FAIL });
                return failover._checkTaskState();
            })
            .then((result) => {
                assert.strictEqual(result.recoverPreviousTask, true);
            })
            .catch((err) => Promise.reject(err)));

        it('should reject and retry when _checkTaskState is RUNNING within time limit', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                downloadDataFromStorageMock.reset();
                downloadDataFromStorageMock.resolves({
                    taskState: constants.FAILOVER_STATES.RUN,
                    timeStamp: new Date().toJSON()
                });
                return failover._checkTaskState();
            })
            .then(() => {
                assert.fail('Expected _checkTaskState to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'retry');
            }));

        it('should recover when _checkTaskState exceeds the running task time limit', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                downloadDataFromStorageMock.reset();
                downloadDataFromStorageMock.resolves({
                    taskState: constants.FAILOVER_STATES.RUN,
                    timeStamp: new Date(Date.parse('2000-01-01T00:00:00.000Z')).toJSON()
                });
                return failover._checkTaskState();
            })
            .then((result) => {
                assert.strictEqual(result.recoverPreviousTask, true);
            })
            .catch((err) => Promise.reject(err)));

        it('should reject from _waitForTask when _checkTaskState rejects', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                const srcUtil = require('../../src/nodejs/util.js');
                // invoke the supplied function once and reject without retrying to avoid the 20 minute retrier
                sinon.stub(srcUtil, 'retrier').callsFake((fn, args, options) => fn.apply(options.thisArg, args));
                sinon.stub(failover, '_checkTaskState').rejects(new Error('checkTaskState boom'));
                return failover._waitForTask();
            })
            .then(() => {
                assert.fail('Expected _waitForTask to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'checkTaskState boom');
            }));
    });

    describe('state object and telemetry', () => {
        it('should reject from _createAndUpdateStateObject when upload fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                uploadDataToStorageSpy.restore();
                sinon.stub(cloudProviderMock, 'uploadDataToStorage').rejects(new Error('upload boom'));
                return failover._createAndUpdateStateObject({
                    taskState: constants.FAILOVER_STATES.PASS,
                    message: 'test'
                });
            })
            .then(() => {
                assert.fail('Expected _createAndUpdateStateObject to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'upload boom');
            }));

        it('should reject from _sendTelemetry when telemetry send fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                telemetryClientSpy.restore();
                sinon.stub(TelemetryClient.prototype, 'send').rejects(new Error('telemetry boom'));
                failover.callerAttributes = { httpMethod: 'POST', endpoint: '/declare' };
                failover.startTimestamp = new Date().toJSON();
                return failover._sendTelemetry({
                    failover: { event: true, success: true },
                    result: constants.FAILOVER_STATES.PASS,
                    resultSummary: 'ok'
                });
            })
            .then(() => {
                assert.fail('Expected _sendTelemetry to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'telemetry boom');
            }));
    });

    describe('reset and status error paths', () => {
        it('should log and resolve undefined when resetFailoverState upload fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                uploadDataToStorageSpy.restore();
                sinon.stub(cloudProviderMock, 'uploadDataToStorage').rejects(new Error('reset upload boom'));
                return failover.resetFailoverState({ resetStateFile: true });
            })
            .then((result) => {
                // catch handler swallows the error and resolves with undefined
                assert.strictEqual(result, undefined);
            })
            .catch((err) => Promise.reject(err)));

        it('should report standby device status when no active traffic groups', () => {
            deviceGetTrafficGroupsMock.returns({
                entries: {
                    key01: {
                        nestedStats: {
                            entries: {
                                deviceName: { description: 'some_device_name' },
                                failoverState: { description: 'standby' },
                                trafficGroup: { description: 'traffic-group-1' }
                            }
                        }
                    }
                }
            });

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => failover.getFailoverStatusAndObjects())
                .then((data) => {
                    assert.strictEqual(data.deviceStatus, 'standby');
                    assert.deepStrictEqual(data.trafficGroup, [{ name: 'traffic-group-1' }]);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should log and resolve undefined when getFailoverStatusAndObjects fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                sinon.stub(cloudProviderMock, 'getAssociatedAddressAndRouteInfo')
                    .rejects(new Error('status boom'));
                return failover.getFailoverStatusAndObjects();
            })
            .then((result) => {
                // catch handler logs and resolves with undefined
                assert.strictEqual(result, undefined);
            })
            .catch((err) => Promise.reject(err)));
    });

    describe('discovery and recovery error paths', () => {
        it('should parse subscriptions from defaultResourceLocations', () => {
            const localDeclaration = {
                class: 'Cloud_Failover',
                environment: 'azure',
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
                    },
                    defaultResourceLocations: [
                        { subscriptionId: 'sub-1' },
                        { subscriptionId: 'sub-2' }
                    ]
                }
            };
            const spyOnCloudProviderInit = sinon.spy(cloudProviderMock, 'init');

            return config.init()
                .then(() => config.processConfigRequest(localDeclaration))
                .then(() => failover.init())
                .then(() => {
                    const callArg = spyOnCloudProviderInit.lastCall.lastArg;
                    assert.deepStrictEqual(callArg.subscriptions, ['sub-1', 'sub-2']);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should resolve empty discovery when no active traffic groups exist', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.selfAddresses = [];
                failover.virtualAddresses = [];
                failover.snatAddresses = [];
                failover.natAddresses = [];
                failover.hasActiveTrafficGroups = false;
                // no traffic groups match the active device
                return failover._getFailoverDiscovery({ entries: {} }, cmDeviceInfoMockResponse);
            })
            .then((result) => {
                assert.deepStrictEqual(result, [{}, {}]);
                assert.strictEqual(failover.hasActiveTrafficGroups, false);
            })
            .catch((err) => Promise.reject(err)));

        it('should discover addresses using addressGroupDefinitions when provided', () => {
            const localDeclaration = util.deepCopy(declaration);
            localDeclaration.failoverAddresses.addressGroupDefinitions = [
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2.2.2.2'
                }
            ];
            cloudProviderMock.discoverAddressOperationsUsingDefinitions = () => Promise.resolve({});
            const spyOnDiscoverDefs = sinon.spy(cloudProviderMock, 'discoverAddressOperationsUsingDefinitions');

            return config.init()
                .then(() => config.processConfigRequest(localDeclaration))
                .then(() => failover.init())
                .then(() => failover.execute())
                .then(() => {
                    assert.strictEqual(spyOnDiscoverDefs.called, true);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should reject from _getFailoverDiscovery when an update action fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.isAddressOperationsEnabled = true;
                failover.isRouteOperationsEnabled = true;
                failover.selfAddresses = [];
                failover.virtualAddresses = [];
                failover.snatAddresses = [];
                failover.natAddresses = [];
                spyOnUpdateRoutes.restore();
                sinon.stub(cloudProviderMock, 'updateRoutes').rejects(new Error('discovery boom'));
                return failover._getFailoverDiscovery(trafficGroupStatsMockResponse, cmDeviceInfoMockResponse);
            })
            .then(() => {
                assert.fail('Expected _getFailoverDiscovery to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'discovery boom');
            }));

        it('should reject from dryRun when discovery fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                sinon.stub(failover, '_getFailoverDiscovery').rejects(new Error('dryRun boom'));
                return failover.dryRun();
            })
            .then(() => {
                assert.fail('Expected dryRun to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'dryRun boom');
            }));

        it('should reject from _getRecoveryOperations when state upload fails', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                uploadDataToStorageSpy.restore();
                sinon.stub(cloudProviderMock, 'uploadDataToStorage').rejects(new Error('recovery upload boom'));
                return failover._getRecoveryOperations({
                    state: {
                        failoverOperations: {
                            addresses: { operation: 'addresses' },
                            routes: { operation: 'routes' }
                        }
                    }
                });
            })
            .then(() => {
                assert.fail('Expected _getRecoveryOperations to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'recovery upload boom');
            }));

        it('should warn when recovering but device has no active traffic groups', () => {
            downloadDataFromStorageMock.onCall(0).resolves({
                taskState: constants.FAILOVER_STATES.FAIL,
                failoverOperations: {
                    addresses: { operation: 'addresses' },
                    routes: { operation: 'routes' }
                },
                message: 'Failover failed because of x'
            });
            // device is not active for any traffic groups
            deviceGetTrafficGroupsMock.returns({
                entries: {
                    key01: {
                        nestedStats: {
                            entries: {
                                deviceName: { description: 'some_device_name' },
                                failoverState: { description: 'standby' },
                                trafficGroup: { description: 'traffic-group-1' }
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
                    // recoverPreviousTask is true so update operations still run
                    assert.strictEqual(failover.recoverPreviousTask, true);
                    assert.strictEqual(
                        uploadDataToStorageSpy.lastCall.args[1].taskState,
                        constants.FAILOVER_STATES.PASS
                    );
                })
                .catch((err) => Promise.reject(err));
        });
    });

    describe('_getOperationEnabledState', () => {
        it('should return false when parent config key is missing', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.config = {};
                assert.strictEqual(failover._getOperationEnabledState('failoverAddresses'), false);
            })
            .catch((err) => Promise.reject(err)));

        it('should return true for backwards compatibility when enabled key is missing', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.config = { failoverAddresses: { scopingTags: {} } };
                assert.strictEqual(failover._getOperationEnabledState('failoverAddresses'), true);
            })
            .catch((err) => Promise.reject(err)));

        it('should return the explicit enabled value when present', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.config = { failoverAddresses: { enabled: false } };
                assert.strictEqual(failover._getOperationEnabledState('failoverAddresses'), false);
            })
            .catch((err) => Promise.reject(err)));
    });

    describe('additional branch coverage', () => {
        it('should warn and skip updates when device is not active for any traffic group', () => {
            // device is standby for its traffic group, so no active traffic groups are discovered
            deviceGetTrafficGroupsMock.returns({
                entries: {
                    key01: {
                        nestedStats: {
                            entries: {
                                deviceName: { description: 'some_device_name' },
                                failoverState: { description: 'standby' },
                                trafficGroup: { description: 'traffic-group-1' }
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
                    // neither recovering nor active -> warning path, no update calls
                    assert.strictEqual(failover.hasActiveTrafficGroups, false);
                    assert.strictEqual(failover.recoverPreviousTask, false);
                    assert.strictEqual(spyOnUpdateAddresses.notCalled, true);
                    assert.strictEqual(
                        uploadDataToStorageSpy.lastCall.args[1].taskState,
                        constants.FAILOVER_STATES.PASS
                    );
                })
                .catch((err) => Promise.reject(err));
        });

        it('should fall back to default state file name when getStateFileName resolves empty', () => {
            sinon.stub(Object.getPrototypeOf(config), 'getStateFileName').resolves(undefined);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => {
                    assert.strictEqual(failover.stateFileName, 'f5cloudfailoverstate.json');
                })
                .catch((err) => Promise.reject(err));
        });

        it('should default address and route discovery to empty objects when discovery resolves falsy', () => {
            sinon.stub(FailoverClient.prototype, '_getFailoverDiscovery').resolves([null, null]);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => failover.execute())
                .then(() => {
                    assert.deepStrictEqual(failover.addressDiscovery, {});
                    assert.deepStrictEqual(failover.routeDiscovery, {});
                })
                .catch((err) => Promise.reject(err));
        });

        it('should build proxy settings using provided defaults', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.proxySettings = { host: '10.0.0.1' };
                const parsed = failover._parseConfig();
                assert.strictEqual(parsed.proxySettings.protocol, 'https');
                assert.strictEqual(parsed.proxySettings.host, '10.0.0.1');
                assert.strictEqual(parsed.proxySettings.port, 3128);
                assert.strictEqual(parsed.proxySettings.username, undefined);
                assert.strictEqual(parsed.proxySettings.password, undefined);
            })
            .catch((err) => Promise.reject(err)));

        it('should build proxy settings using explicit values', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.proxySettings = {
                    host: '10.0.0.1',
                    protocol: 'http',
                    port: 8080,
                    username: 'user',
                    password: 'pass'
                };
                const parsed = failover._parseConfig();
                assert.strictEqual(parsed.proxySettings.protocol, 'http');
                assert.strictEqual(parsed.proxySettings.port, 8080);
                assert.strictEqual(parsed.proxySettings.username, 'user');
                assert.strictEqual(parsed.proxySettings.password, 'pass');
            })
            .catch((err) => Promise.reject(err)));

        it('should resolve next hop address defaults when range nextHopAddresses lacks fields', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                // range provides nextHopAddresses but without discoveryType/items -> defaults applied
                const resolved = failover._nextHopAddressResolver({ nextHopAddresses: {} }, {});
                assert.strictEqual(resolved.type, 'routeTag');
                assert.deepStrictEqual(resolved.items, []);
            })
            .catch((err) => Promise.reject(err)));

        it('should resolve next hop address defaults from defaultNextHopAddresses when range has none', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                // range has no nextHopAddresses -> falls back to defaultNextHopAddresses
                const resolved = failover._nextHopAddressResolver({}, {});
                assert.strictEqual(resolved.type, 'routeTag');
                assert.strictEqual(resolved.items, undefined);
            })
            .catch((err) => Promise.reject(err)));

        it('should normalize AWS operations with default public addresses', () => {
            sinon.stub(failover, '_getFailoverDiscovery').resolves([
                {
                    interfaces: { disassociate: [], associate: [] }
                },
                { operations: [] }
            ]);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => {
                    failover.config.environment = 'aws';
                })
                .then(() => failover.dryRun())
                .then((output) => {
                    assert.deepStrictEqual(output[0].publicAddresses, {});
                    assert.deepStrictEqual(output[0].loadBalancerAddresses, {});
                    assert.deepStrictEqual(output[1].operations, []);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should normalize Azure operations when publicIPAddress is missing', () => {
            sinon.stub(failover, '_getFailoverDiscovery').resolves([
                {
                    interfaces: {
                        disassociate: [
                            [null, null, {
                                name: 'nic0',
                                properties: {
                                    provisioningState: 'Succeeded',
                                    ipConfigurations: [
                                        {
                                            properties: {
                                                privateIPAddress: '10.0.0.4',
                                                publicIPAddress: null,
                                                subnet: { id: 'subnet-id' },
                                                primary: true
                                            }
                                        }
                                    ]
                                }
                            }]
                        ],
                        associate: [
                            [null, null, {
                                name: 'nic1',
                                properties: {
                                    provisioningState: 'Succeeded',
                                    ipConfigurations: [
                                        {
                                            properties: {
                                                privateIPAddress: '10.0.0.5',
                                                publicIPAddress: {},
                                                subnet: { id: 'subnet-id' },
                                                primary: false
                                            }
                                        }
                                    ]
                                }
                            }]
                        ]
                    }
                },
                { operations: [] }
            ]);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => {
                    failover.config.environment = 'azure';
                })
                .then(() => failover.dryRun())
                .then((output) => {
                    assert.strictEqual(output[0].operations.toStandby[0].publicIPAddress, null);
                    assert.strictEqual(output[0].operations.toActive[0].publicIPAddress, null);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should normalize Azure operations when publicIPAddress id is present', () => {
            sinon.stub(failover, '_getFailoverDiscovery').resolves([
                {
                    interfaces: {
                        disassociate: [
                            [null, null, {
                                name: 'nic0',
                                properties: {
                                    provisioningState: 'Succeeded',
                                    ipConfigurations: [
                                        {
                                            properties: {
                                                privateIPAddress: '10.0.0.4',
                                                publicIPAddress: { id: '/subscriptions/x/publicIp/standby' },
                                                subnet: { id: 'subnet-id' },
                                                primary: true
                                            }
                                        }
                                    ]
                                }
                            }]
                        ],
                        associate: [
                            [null, null, {
                                name: 'nic1',
                                properties: {
                                    provisioningState: 'Succeeded',
                                    ipConfigurations: [
                                        {
                                            properties: {
                                                privateIPAddress: '10.0.0.5',
                                                publicIPAddress: { id: '/subscriptions/x/publicIp/active' },
                                                subnet: { id: 'subnet-id' },
                                                primary: false
                                            }
                                        }
                                    ]
                                }
                            }]
                        ]
                    }
                },
                { operations: [] }
            ]);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => {
                    failover.config.environment = 'azure';
                })
                .then(() => failover.dryRun())
                .then((output) => {
                    assert.strictEqual(
                        output[0].operations.toStandby[0].publicIPAddress,
                        '/subscriptions/x/publicIp/standby'
                    );
                    assert.strictEqual(
                        output[0].operations.toActive[0].publicIPAddress,
                        '/subscriptions/x/publicIp/active'
                    );
                })
                .catch((err) => Promise.reject(err));
        });

        it('should normalize GCP operations when loadBalancerAddresses has no operations', () => {
            sinon.stub(failover, '_getFailoverDiscovery').resolves([
                {
                    interfaces: { disassociate: [], associate: [] },
                    loadBalancerAddresses: {}
                },
                { operations: [] }
            ]);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => failover.init())
                .then(() => {
                    failover.config.environment = 'gcp';
                })
                .then(() => failover.dryRun())
                .then((output) => {
                    assert.deepStrictEqual(output[0].loadBalancerAddresses, {});
                })
                .catch((err) => Promise.reject(err));
        });

        it('should create a state object with default values when options are empty', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => {
                failover.hostname = null;
                const state = failover._createStateObject({});
                assert.strictEqual(state.taskState, constants.FAILOVER_STATES.PASS);
                assert.strictEqual(state.instance, 'none');
                assert.strictEqual(state.message, '');
            })
            .catch((err) => Promise.reject(err)));

        it('should create and update a state object with default values when options are empty', () => config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => failover.init())
            .then(() => failover._createAndUpdateStateObject({}))
            .then((state) => {
                assert.strictEqual(state.taskState, constants.FAILOVER_STATES.PASS);
                assert.deepStrictEqual(state.failoverOperations, {});
                assert.strictEqual(state.message, '');
            })
            .catch((err) => Promise.reject(err)));
    });
});
