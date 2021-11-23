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
const nock = require('nock');
const assert = require('assert');

const constants = require('../constants.js');
const Device = require('../../src/nodejs/device');

describe('Device', () => {
    let device;

    beforeEach(() => {
        device = new Device({ hostname: 'localhost', mgmtPort: 443 });
        device.bigip.ready = sinon.stub().resolves();
    });
    afterEach(() => {
        sinon.restore();
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
        nock.cleanAll();
    });

    it('validate constructor', () => {
        assert.ok(new Device({
            hostname: 'localhost',
            username: 'admin',
            password: 'admin',
            port: '443'
        }));
        assert.ok(new Device());
    });

    it('validate initialize', () => device.init()
        .then(() => {
            assert.ok(true);
        })
        .catch((err) => Promise.reject(err)));

    it('validate initialize using discover mgmt port', () => {
        sinon.stub(Device.prototype, '_connectAddress')
            .resolves({ connected: true, port: 443 });

        device = new Device({ hostname: 'localhost' });
        device.bigip.ready = sinon.stub().resolves();

        return device.init()
            .then(() => {
                assert.strictEqual(device.mgmtPort, 443);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate initialize using discover mgmt port discovers 8443', () => {
        const connectAddressMock = sinon.stub(Device.prototype, '_connectAddress');
        connectAddressMock.onCall(0).resolves({ connected: false, port: 443 });
        connectAddressMock.onCall(1).resolves({ connected: true, port: 8443 });

        device = new Device({ hostname: 'localhost' });
        device.bigip.ready = sinon.stub().resolves();

        return device.init()
            .then(() => {
                assert.strictEqual(device.mgmtPort, 8443);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getConfig', () => {
        nock('https://localhost')
            .get('/mgmt/foo')
            .reply(200, 'foo');

        return device.init()
            .then(() => device.getConfig(['/foo']))
            .then((data) => {
                assert.deepStrictEqual('foo', data[0]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate executeBigIpBashCmd', () => {
        nock('https://localhost')
            .post('/mgmt/tm/util/bash')
            .reply(200, {
                commandResult: 'foo'
            });

        return device.init()
            .then(() => device.executeBigIpBashCmd('ls -la'))
            .then((data) => {
                assert.strictEqual(data, 'foo');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getGlobalSettings', () => {
        nock('https://localhost')
            .get('/mgmt/tm/sys/global-settings')
            .reply(200, 'globalSettings');

        return device.init()
            .then(() => device.getGlobalSettings())
            .then((globalSettings) => {
                assert.strictEqual(globalSettings, 'globalSettings');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getProxySettings', () => {
        nock('https://localhost')
            .get('/mgmt/tm/sys/db')
            .reply(200,
                [{
                    name: 'proxy.host',
                    value: '1.1.1.1'
                },
                {
                    name: 'proxy.password',
                    value: '<null>'
                }, {
                    name: 'proxy.port',
                    value: '8080'
                }, {
                    name: 'proxy.protocol',
                    value: 'http'
                }, {
                    name: 'proxy.username',
                    value: '<null>'
                }]);
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

    it('validate getTrafficGroupsStats', () => {
        nock('https://localhost')
            .get('/mgmt/tm/cm/traffic-group/stats')
            .reply(200, 'trafficGroupStats');

        return device.init()
            .then(() => device.getTrafficGroupsStats())
            .then((trafficGroupStats) => {
                assert.strictEqual(trafficGroupStats, 'trafficGroupStats');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getSelfAddresses', () => {
        nock('https://localhost')
            .get('/mgmt/tm/net/self')
            .reply(200, 'selfAddresses');

        return device.init()
            .then(() => device.getSelfAddresses())
            .then((selfAddresses) => {
                assert.strictEqual(selfAddresses, 'selfAddresses');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getVirtualAddresses', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/virtual-address')
            .reply(200, [{ address: '10.10.10.10/24' }]);

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then((virtualAddresses) => {
                assert.deepStrictEqual(virtualAddresses, [{ address: '10.10.10.10/24' }]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getVirtualAddresses with "any" address', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/virtual-address')
            .reply(200, [{ address: 'any' }]);

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then((virtualAddresses) => {
                assert.deepStrictEqual(virtualAddresses, [{ address: '0.0.0.0/0' }]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getVirtualAddresses with "any6" address', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/virtual-address')
            .reply(200, [{ address: 'any6' }]);

        return device.init()
            .then(() => device.getVirtualAddresses())
            .then((virtualAddresses) => {
                assert.deepStrictEqual(virtualAddresses, [{ address: '::/0' }]);
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getSnatTranslationAddresses', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/snat-translation')
            .reply(200, 'snatTranslationAddresses');

        return device.init()
            .then(() => device.getSnatTranslationAddresses())
            .then((snatTranslationAddresses) => {
                assert.strictEqual(snatTranslationAddresses, 'snatTranslationAddresses');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getNatAddresses', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/nat')
            .reply(200, 'natAddresses');

        return device.init()
            .then(() => device.getNatAddresses())
            .then((natAddresses) => {
                assert.strictEqual(natAddresses, 'natAddresses');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getDataGroups', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/data-group/internal')
            .reply(200, 'dataGroups');

        return device.init()
            .then(() => device.getDataGroups())
            .then((dataGroups) => {
                assert.strictEqual(dataGroups, 'dataGroups');
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate getDataGroups with optional name', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/data-group/internal')
            .reply(200, [constants.DATA_GROUP_OBJECT]);

        return device.init()
            .then(() => device.getDataGroups({ name: constants.DATA_GROUP_OBJECT.name }))
            .then((dataGroups) => {
                assert.deepStrictEqual(dataGroups, { exists: true, data: constants.DATA_GROUP_OBJECT });
            })
            .catch((err) => Promise.reject(err));
    });

    it('validate createDataGroup creates data group and saves config', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/data-group/internal')
            .reply(200, [])
            .post('/mgmt/tm/ltm/data-group/internal',
                {
                    name: constants.DATA_GROUP_OBJECT.name,
                    type: 'string',
                    records: constants.DATA_GROUP_OBJECT.records
                })
            .reply(200, [constants.DATA_GROUP_OBJECT])
            .post('/mgmt/tm/sys/config', { command: 'save' })
            .reply(200, {});

        return device.init()
            .then(() => device.createDataGroup(
                constants.DATA_GROUP_OBJECT.name,
                constants.DATA_GROUP_OBJECT.records
            ))
            .catch((err) => Promise.reject(err));
    });

    it('validate createDataGroup updates existing data group and saves config', () => {
        nock('https://localhost')
            .get('/mgmt/tm/ltm/data-group/internal')
            .reply(200, [constants.DATA_GROUP_OBJECT])
            .patch(`/mgmt/tm/ltm/data-group/internal/${constants.DATA_GROUP_OBJECT.name}`,
                {
                    name: constants.DATA_GROUP_OBJECT.name,
                    type: 'string',
                    records: constants.DATA_GROUP_OBJECT.records
                })
            .reply(200, [constants.DATA_GROUP_OBJECT])
            .post('/mgmt/tm/sys/config', { command: 'save' })
            .reply(200, {});

        return device.init()
            .then(() => device.createDataGroup(
                constants.DATA_GROUP_OBJECT.name,
                constants.DATA_GROUP_OBJECT.records
            ))
            .catch((err) => Promise.reject(err));
    });

    it('validate getCMDeviceInfo', () => {
        nock('https://localhost')
            .get('/mgmt/tm/cm/device')
            .reply(200, 'cmDeviceInfo');

        return device.init()
            .then(() => device.getCMDeviceInfo())
            .then((cmDeviceInfo) => {
                assert.strictEqual(cmDeviceInfo, 'cmDeviceInfo');
            })
            .catch((err) => Promise.reject(err));
    });
});
