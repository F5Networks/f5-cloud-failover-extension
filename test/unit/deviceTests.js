/**
 * Copyright 2021 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const sinon = require('sinon');
const assert = require('assert');
const EventEmitter = require('events');
const net = require('net');

const constants = require('../constants.js');
const Device = require('../../src/nodejs/device');

describe('Device', () => {
    let device;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        device = new Device({ hostname: 'localhost', mgmtPort: 443 });
        device.bigip.ready = sandbox.stub().resolves();
    });

    afterEach(() => {
        sandbox.restore();
    });

    // -- constructor -----------------------------------------------------------

    it('validate constructor', () => {
        assert.ok(new Device({
            hostname: 'localhost',
            username: 'admin',
            password: 'admin',
            port: '443'
        }));
        assert.ok(new Device());
    });

    it('should use default values when no options provided', () => {
        const d = new Device();
        assert.strictEqual(d.hostname, 'localhost');
        assert.strictEqual(d.username, 'admin');
        assert.strictEqual(d.password, 'admin');
        assert.strictEqual(d.mgmtPort, 'discover');
        assert.strictEqual(d.product, 'BIG-IP');
    });

    // -- init ------------------------------------------------------------------

    it('validate initialize', () => device.init()
        .then(() => {
            assert.ok(true);
        })
        .catch((err) => Promise.reject(err)));

    it('validate initialize using discover mgmt port', () => {
        sandbox.stub(Device.prototype, '_connectAddress')
            .resolves({ connected: true, port: 443 });

        device = new Device({ hostname: 'localhost' });
        device.bigip.ready = sandbox.stub().resolves();

        return device.init()
            .then(() => {
                assert.strictEqual(device.mgmtPort, 443);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate initialize using discover mgmt port discovers 8443', () => {
        const connectAddressMock = sandbox.stub(Device.prototype, '_connectAddress');
        connectAddressMock.onCall(0).resolves({ connected: false, port: 443 });
        connectAddressMock.onCall(1).resolves({ connected: true, port: 8443 });

        device = new Device({ hostname: 'localhost' });
        device.bigip.ready = sandbox.stub().resolves();

        return device.init()
            .then(() => {
                assert.strictEqual(device.mgmtPort, 8443);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject init when bigip.init fails', () => {
        const initError = new Error('bigip init failed');
        sandbox.stub(device.bigip, 'init').rejects(initError);

        return device.init()
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'bigip init failed');
            });
    });

    // -- discoverMgmtPort ------------------------------------------------------

    it('should reject when no ports connect successfully', () => {
        const connectStub = sandbox.stub(Device.prototype, '_connectAddress');
        connectStub.onCall(0).resolves({ connected: false, port: 443 });
        connectStub.onCall(1).resolves({ connected: false, port: 8443 });

        device = new Device({ hostname: 'localhost' });
        device.bigip.ready = sandbox.stub().resolves();

        return device.discoverMgmtPort()
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.ok(err.message.includes('Port discovery failed'));
            });
    });

    // -- _connectAddress -------------------------------------------------------

    it('should resolve with connected true on successful connection', () => {
        const fakeSocket = new EventEmitter();
        fakeSocket.end = sandbox.stub();
        fakeSocket.destroy = sandbox.stub();
        sandbox.stub(net, 'createConnection').returns(fakeSocket);

        const promise = device._connectAddress('localhost', 443);
        fakeSocket.emit('connect');

        return promise.then((result) => {
            assert.deepStrictEqual(result, { connected: true, port: 443 });
            assert.ok(fakeSocket.end.calledOnce);
        });
    });

    it('should resolve with connected false on connection error', () => {
        const fakeSocket = new EventEmitter();
        fakeSocket.end = sandbox.stub();
        fakeSocket.destroy = sandbox.stub();
        sandbox.stub(net, 'createConnection').returns(fakeSocket);

        const promise = device._connectAddress('localhost', 8443);
        fakeSocket.emit('error', new Error('ECONNREFUSED'));

        return promise.then((result) => {
            assert.deepStrictEqual(result, { connected: false, port: 8443 });
            assert.ok(fakeSocket.destroy.calledOnce);
        });
    });

    // -- getConfig (stub-based) -----------------------------------------------

    it('validate getConfig', () => {
        sandbox.stub(device.bigip, 'list').resolves('foo');

        return device.init()
            .then(() => device.getConfig(['/foo']))
            .then((data) => {
                assert.deepStrictEqual('foo', data[0]);
            })
            .catch((err) => Promise.reject(err));
    });

    // -- executeBigIpBashCmd ---------------------------------------------------

    it('validate executeBigIpBashCmd', () => {
        sandbox.stub(device.bigip, 'create').resolves({ commandResult: 'foo' });

        return device.init()
            .then(() => device.executeBigIpBashCmd('ls -la'))
            .then((data) => {
                assert.strictEqual(data, 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when executeBigIpBashCmd fails', () => {
        sandbox.stub(device.bigip, 'create').rejects(new Error('bash cmd failed'));

        return device.init()
            .then(() => device.executeBigIpBashCmd('bad-cmd'))
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'bash cmd failed');
            });
    });

    // -- getGlobalSettings ----------------------------------------------------

    it('validate getGlobalSettings', () => {
        sandbox.stub(device.bigip, 'list').resolves('globalSettings');

        return device.init()
            .then(() => device.getGlobalSettings())
            .then((globalSettings) => {
                assert.strictEqual(globalSettings, 'globalSettings');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getGlobalSettings fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('global settings error'));

        return device.init()
            .then(() => device.getGlobalSettings())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'global settings error');
            });
    });

    // -- getProxySettings -----------------------------------------------------

    it('validate getProxySettings', () => {
        sandbox.stub(device.bigip, 'list').resolves([
            { name: 'proxy.host', value: '1.1.1.1' },
            { name: 'proxy.password', value: '<null>' },
            { name: 'proxy.port', value: '8080' },
            { name: 'proxy.protocol', value: 'http' },
            { name: 'proxy.username', value: '<null>' }
        ]);

        const expectedProxySettings = {
            host: '1.1.1.1',
            password: '',
            port: '8080',
            protocol: 'http',
            username: ''
        };

        return device.init()
            .then(() => device.getProxySettings())
            .then((proxySettings) => {
                assert.deepStrictEqual(proxySettings, expectedProxySettings);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should handle proxy settings with real values (not <null>)', () => {
        sandbox.stub(device.bigip, 'list').resolves([
            { name: 'proxy.host', value: 'proxy.example.com' },
            { name: 'proxy.password', value: 'secret' },
            { name: 'proxy.port', value: '3128' },
            { name: 'proxy.protocol', value: 'https' },
            { name: 'proxy.username', value: 'proxyuser' }
        ]);

        return device.init()
            .then(() => device.getProxySettings())
            .then((proxySettings) => {
                assert.deepStrictEqual(proxySettings, {
                    host: 'proxy.example.com',
                    password: 'secret',
                    port: '3128',
                    protocol: 'https',
                    username: 'proxyuser'
                });
            });
    });

    it('should handle proxy settings with unknown db entries (default switch case)', () => {
        sandbox.stub(device.bigip, 'list').resolves([
            { name: 'proxy.host', value: '1.1.1.1' },
            { name: 'some.other.setting', value: 'ignored' }
        ]);

        return device.init()
            .then(() => device.getProxySettings())
            .then((proxySettings) => {
                assert.strictEqual(proxySettings.host, '1.1.1.1');
                // Other settings should remain at defaults
                assert.strictEqual(proxySettings.password, '');
                assert.strictEqual(proxySettings.port, '');
                assert.strictEqual(proxySettings.protocol, '');
                assert.strictEqual(proxySettings.username, '');
            });
    });

    it('should reject when getProxySettings fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('proxy error'));

        return device.init()
            .then(() => device.getProxySettings())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'proxy error');
            });
    });

    // -- getTrafficGroupsStats -------------------------------------------------

    it('validate getTrafficGroupsStats', () => {
        sandbox.stub(device.bigip, 'list').resolves('trafficGroupStats');

        return device.init()
            .then(() => device.getTrafficGroupsStats())
            .then((trafficGroupStats) => {
                assert.strictEqual(trafficGroupStats, 'trafficGroupStats');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getTrafficGroupsStats fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('traffic groups error'));

        return device.init()
            .then(() => device.getTrafficGroupsStats())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'traffic groups error');
            });
    });

    // -- getSelfAddresses -----------------------------------------------------

    it('validate getSelfAddresses', () => {
        sandbox.stub(device.bigip, 'list').resolves('selfAddresses');

        return device.init()
            .then(() => device.getSelfAddresses())
            .then((selfAddresses) => {
                assert.strictEqual(selfAddresses, 'selfAddresses');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getSelfAddresses fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('self addresses error'));

        return device.init()
            .then(() => device.getSelfAddresses())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'self addresses error');
            });
    });

    // -- getVirtualAddresses --------------------------------------------------

    it('validate getVirtualAddresses', () => {
        sandbox.stub(device.bigip, 'list').resolves([{ address: '10.10.10.10/24' }]);

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then((virtualAddresses) => {
                assert.deepStrictEqual(virtualAddresses, [{ address: '10.10.10.10/24' }]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getVirtualAddresses with "any" address', () => {
        sandbox.stub(device.bigip, 'list').resolves([{ address: 'any' }]);

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then((virtualAddresses) => {
                assert.deepStrictEqual(virtualAddresses, [{ address: '0.0.0.0/0' }]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getVirtualAddresses with "any6" address', () => {
        sandbox.stub(device.bigip, 'list').resolves([{ address: 'any6' }]);

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then((virtualAddresses) => {
                assert.deepStrictEqual(virtualAddresses, [{ address: '::/0' }]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getVirtualAddresses fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('virtual addresses error'));

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'virtual addresses error');
            });
    });

    // -- getSnatTranslationAddresses ------------------------------------------

    it('validate getSnatTranslationAddresses', () => {
        sandbox.stub(device.bigip, 'list').resolves('snatTranslationAddresses');

        return device.init()
            .then(() => device.getSnatTranslationAddresses())
            .then((snatTranslationAddresses) => {
                assert.strictEqual(snatTranslationAddresses, 'snatTranslationAddresses');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getSnatTranslationAddresses fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('snat error'));

        return device.init()
            .then(() => device.getSnatTranslationAddresses())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'snat error');
            });
    });

    // -- getNatAddresses ------------------------------------------------------

    it('validate getNatAddresses', () => {
        sandbox.stub(device.bigip, 'list').resolves('natAddresses');

        return device.init()
            .then(() => device.getNatAddresses())
            .then((natAddresses) => {
                assert.strictEqual(natAddresses, 'natAddresses');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getNatAddresses fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('nat error'));

        return device.init()
            .then(() => device.getNatAddresses())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'nat error');
            });
    });

    // -- getDataGroups --------------------------------------------------------

    it('validate getDataGroups', () => {
        sandbox.stub(device.bigip, 'list').resolves('dataGroups');

        return device.init()
            .then(() => device.getDataGroups())
            .then((dataGroups) => {
                assert.strictEqual(dataGroups, 'dataGroups');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getDataGroups with optional name', () => {
        sandbox.stub(device.bigip, 'list').resolves([constants.DATA_GROUP_OBJECT]);

        return device.init()
            .then(() => device.getDataGroups({ name: constants.DATA_GROUP_OBJECT.name }))
            .then((dataGroups) => {
                assert.deepStrictEqual(dataGroups, { exists: true, data: constants.DATA_GROUP_OBJECT });
            })
            .catch((err) => Promise.reject(err));
    });

    it('should return exists false when data group name not found', () => {
        sandbox.stub(device.bigip, 'list').resolves([{ name: 'other-group' }]);

        return device.init()
            .then(() => device.getDataGroups({ name: 'nonexistent-group' }))
            .then((result) => {
                assert.deepStrictEqual(result, { exists: false, data: {} });
            });
    });

    it('should reject when more than one data group matches', () => {
        const dupeGroup = { name: 'dupe-group', records: [] };
        sandbox.stub(device.bigip, 'list').resolves([dupeGroup, dupeGroup]);

        return device.init()
            .then(() => device.getDataGroups({ name: 'dupe-group' }))
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.ok(err.message.includes('More than one data group match found'));
            });
    });

    it('should reject when getDataGroups fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('data groups error'));

        return device.init()
            .then(() => device.getDataGroups())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'data groups error');
            });
    });

    // -- createDataGroup / saveConfig -----------------------------------------

    it('validate createDataGroup creates data group and saves config', () => {
        sandbox.stub(device.bigip, 'list').resolves([]);
        sandbox.stub(device.bigip, 'create').resolves([constants.DATA_GROUP_OBJECT]);

        const expectedBody = {
            name: constants.DATA_GROUP_OBJECT.name,
            type: 'string',
            records: constants.DATA_GROUP_OBJECT.records
        };

        return device.init()
            .then(() => device.createDataGroup(
                constants.DATA_GROUP_OBJECT.name,
                constants.DATA_GROUP_OBJECT.records
            ))
            .then(() => {
                // create called for data group and then for saveConfig
                assert.strictEqual(device.bigip.create.callCount, 2);
                // First call: create the data group
                assert.strictEqual(
                    device.bigip.create.firstCall.args[0], '/tm/ltm/data-group/internal'
                );
                assert.deepStrictEqual(device.bigip.create.firstCall.args[1], expectedBody);
                // Second call: saveConfig
                assert.strictEqual(device.bigip.create.secondCall.args[0], '/tm/sys/config');
                assert.deepStrictEqual(
                    device.bigip.create.secondCall.args[1], { command: 'save' }
                );
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate createDataGroup updates existing data group and saves config', () => {
        sandbox.stub(device.bigip, 'list').resolves([constants.DATA_GROUP_OBJECT]);
        sandbox.stub(device.bigip, 'modify').resolves([constants.DATA_GROUP_OBJECT]);
        sandbox.stub(device.bigip, 'create').resolves({});

        const expectedBody = {
            name: constants.DATA_GROUP_OBJECT.name,
            type: 'string',
            records: constants.DATA_GROUP_OBJECT.records
        };

        return device.init()
            .then(() => device.createDataGroup(
                constants.DATA_GROUP_OBJECT.name,
                constants.DATA_GROUP_OBJECT.records
            ))
            .then(() => {
                // modify called with the correct URI and body
                assert.ok(device.bigip.modify.calledOnce);
                assert.strictEqual(
                    device.bigip.modify.firstCall.args[0],
                    `/tm/ltm/data-group/internal/${constants.DATA_GROUP_OBJECT.name}`
                );
                assert.deepStrictEqual(device.bigip.modify.firstCall.args[1], expectedBody);
                // create called only for saveConfig
                assert.strictEqual(device.bigip.create.callCount, 1);
                assert.strictEqual(device.bigip.create.firstCall.args[0], '/tm/sys/config');
                assert.deepStrictEqual(
                    device.bigip.create.firstCall.args[1], { command: 'save' }
                );
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when createDataGroup fails', () => {
        sandbox.stub(device.bigip, 'list').resolves([]);
        sandbox.stub(device.bigip, 'create').rejects(new Error('create failed'));

        return device.init()
            .then(() => device.createDataGroup('test-group', []))
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'create failed');
            });
    });

    it('should reject when saveConfig fails', () => {
        sandbox.stub(device.bigip, 'list').resolves([]);
        const createStub = sandbox.stub(device.bigip, 'create');
        // First call (create data group) succeeds
        createStub.onFirstCall().resolves([]);
        // Second call (saveConfig) fails
        createStub.onSecondCall().rejects(new Error('save config failed'));

        return device.init()
            .then(() => device.createDataGroup('test-group', []))
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'save config failed');
            });
    });

    // -- getCMDeviceInfo ------------------------------------------------------

    it('validate getCMDeviceInfo', () => {
        sandbox.stub(device.bigip, 'list').resolves('cmDeviceInfo');

        return device.init()
            .then(() => device.getCMDeviceInfo())
            .then((cmDeviceInfo) => {
                assert.strictEqual(cmDeviceInfo, 'cmDeviceInfo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject when getCMDeviceInfo fails', () => {
        sandbox.stub(device.bigip, 'list').rejects(new Error('cm device info error'));

        return device.init()
            .then(() => device.getCMDeviceInfo())
            .then(() => {
                assert.fail('Should have rejected');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'cm device info error');
            });
    });
});
