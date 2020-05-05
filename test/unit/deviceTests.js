/**
 * Copyright 2020 F5 Networks, Inc.
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

const sinon = require('sinon'); /* eslint-disable-line import/no-extraneous-dependencies */
const assert = require('assert');
const constants = require('../constants.js');

const Device = require('../../src/nodejs/device');

const mockResults = {
    '/tm/sys/global-settings': ['globalSettings'],
    '/tm/cm/traffic-group/stats': ['trafficGroups'],
    '/tm/net/self': ['selfAddresses'],
    '/tm/ltm/virtual-address': [{ address: '10.10.10.10/24' }],
    '/tm/ltm/snat-translation': ['snatTranslationAddress'],
    '/tm/ltm/nat': ['natAddress'],
    '/tm/ltm/data-group/internal': [constants.DATA_GROUP_OBJECT]
};

describe('Device', () => {
    let device;
    let deviceGetConfig;

    let connectAddressMock;

    beforeEach(() => {
        device = new Device();
        deviceGetConfig = device.getConfig;

        device.bigip.init = sinon.stub().resolves();

        connectAddressMock = sinon.stub(Device.prototype, '_connectAddress')
            .resolves({ connected: true, port: 443 });
    });
    afterEach(() => {
        sinon.restore();
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
        .catch(err => Promise.reject(err)));

    it('validate initialize using discover mgmt port', () => device.init()
        .then(() => {
            assert.strictEqual(device.mgmtPort, 443);
        })
        .catch(err => Promise.reject(err)));

    it('validate initialize using discover mgmt port discovers 8443', () => {
        connectAddressMock.onCall(0).resolves({ connected: false, port: 443 });
        connectAddressMock.onCall(1).resolves({ connected: true, port: 8443 });

        return device.init()
            .then(() => {
                assert.strictEqual(device.mgmtPort, 8443);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate getConfig', () => {
        device.getConfig = deviceGetConfig;
        device.bigip.list = sinon.stub().resolves('foo');

        return device.getConfig(['/foo'])
            .then((data) => {
                assert.deepStrictEqual('foo', data[0]);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate executeBigIpBashCmd', () => {
        const command = 'ls -la';
        device.bigip = sinon.stub();
        device.bigip.create = sinon.stub((path, commandBody, iControlOptions, retries) => {
            assert.strictEqual(path, '/tm/util/bash');
            assert.strictEqual(commandBody.command, 'run');
            assert.strictEqual(commandBody.utilCmdArgs, '-c ls -la');
            assert.strictEqual(iControlOptions, undefined);
            assert.strictEqual(retries.maxRetries, 0);
            assert.strictEqual(retries.retryIntervalMs, 0);
            return Promise.resolve({
                commandResult: ''
            });
        });
        return device.executeBigIpBashCmd(command);
    });


    it('validate getGlobalSettings', () => device.init()
        .then(() => {
            const expectedValue = mockResults['/tm/sys/global-settings'];
            device.getConfig = sinon.stub().resolves(expectedValue);
            return device.getGlobalSettings();
        })
        .then((globalSettings) => {
            assert.strictEqual(globalSettings, 'globalSettings');
        })
        .catch(err => Promise.reject(err)));

    it('validate getTrafficGroupsStats', () => device.init()
        .then(() => {
            const expectedValue = mockResults['/tm/cm/traffic-group/stats'];
            device.getConfig = sinon.stub().resolves(expectedValue);
            return device.getTrafficGroupsStats();
        })
        .then((trafficGroupsStats) => {
            assert.strictEqual(trafficGroupsStats, 'trafficGroups');
        })
        .catch(err => Promise.reject(err)));

    it('validate getSelfAddresses', () => device.init()
        .then(() => {
            const expectedValue = mockResults['/tm/net/self'];
            device.getConfig = sinon.stub().resolves(expectedValue);
            return device.getSelfAddresses();
        })
        .then((selfAddresses) => {
            assert.strictEqual(selfAddresses, 'selfAddresses');
        })
        .catch(err => Promise.reject(err)));

    it('validate getVirtualAddresses', () => device.init()
        .then(() => {
            device.getConfig = sinon.stub().resolves([mockResults['/tm/ltm/virtual-address']]);
            return device.getVirtualAddresses();
        })
        .then((virtualAddresses) => {
            assert.deepStrictEqual(virtualAddresses, mockResults['/tm/ltm/virtual-address']);
        })
        .catch(err => Promise.reject(err)));

    it('validate getVirtualAddresses with "any" address', () => device.init()
        .then(() => {
            device.getConfig = sinon.stub().resolves([[{ address: 'any' }]]);
            return device.getVirtualAddresses();
        })
        .then((virtualAddresses) => {
            assert.deepStrictEqual(virtualAddresses, [{ address: '0.0.0.0/0' }]);
        })
        .catch(err => Promise.reject(err)));

    it('validate getVirtualAddresses with "any6" address', () => device.init()
        .then(() => {
            device.getConfig = sinon.stub().resolves([[{ address: 'any6' }]]);
            return device.getVirtualAddresses();
        })
        .then((virtualAddresses) => {
            assert.deepStrictEqual(virtualAddresses, [{ address: '::/0' }]);
        })
        .catch(err => Promise.reject(err)));

    it('validate getSnatTranslationAddresses', () => device.init()
        .then(() => {
            const expectedValue = mockResults['/tm/ltm/snat-translation'];
            device.getConfig = sinon.stub().resolves(expectedValue);
            return device.getSnatTranslationAddresses();
        })
        .then((snatTranslationAddresses) => {
            assert.strictEqual(snatTranslationAddresses, 'snatTranslationAddress');
        })
        .catch(err => Promise.reject(err)));

    it('validate getNatAddresses', () => device.init()
        .then(() => {
            const expectedValue = mockResults['/tm/ltm/nat'];
            device.getConfig = sinon.stub().resolves(expectedValue);
            return device.getNatAddresses();
        })
        .then((snatTranslationAddresses) => {
            assert.strictEqual(snatTranslationAddresses, 'natAddress');
        })
        .catch(err => Promise.reject(err)));

    it('validate getDataGroups', () => device.init()
        .then(() => {
            device.getConfig = sinon.stub().resolves([mockResults['/tm/ltm/data-group/internal']]);
            return device.getDataGroups();
        })
        .then((dataGroups) => {
            assert.deepStrictEqual(dataGroups, [constants.DATA_GROUP_OBJECT]);
        })
        .catch(err => Promise.reject(err)));

    it('validate getDataGroups with optional name', () => device.init()
        .then(() => {
            device.getConfig = sinon.stub().resolves([mockResults['/tm/ltm/data-group/internal']]);
            return device.getDataGroups({ name: constants.DATA_GROUP_OBJECT.name });
        })
        .then((dataGroups) => {
            assert.deepStrictEqual(dataGroups, { exists: true, data: constants.DATA_GROUP_OBJECT });
        })
        .catch(err => Promise.reject(err)));

    it('validate createDataGroup creates data group and saves config', () => {
        device.getConfig = sinon.stub().resolves([[]]);
        device.bigip.create = sinon.stub().resolves();

        return device.init()
            .then(() => device.createDataGroup(
                constants.DATA_GROUP_OBJECT.name,
                constants.DATA_GROUP_OBJECT.records
            ))
            .then(() => {
                const createArgs = device.bigip.create.getCall(0).args;
                assert.deepStrictEqual(createArgs[0], '/tm/ltm/data-group/internal');
                assert.deepStrictEqual(createArgs[1].name, constants.DATA_GROUP_OBJECT.name);

                // validate configuration is saved
                const saveArgs = device.bigip.create.getCall(1).args;
                assert.deepStrictEqual(saveArgs[0], '/tm/sys/config');
                assert.deepStrictEqual(saveArgs[1], { command: 'save' });
            })
            .catch(err => Promise.reject(err));
    });

    it('validate createDataGroup updates existing data group and saves config', () => {
        device.getConfig = sinon.stub().resolves([mockResults['/tm/ltm/data-group/internal']]);
        device.bigip.create = sinon.stub().resolves();
        device.bigip.modify = sinon.stub().resolves();

        return device.init()
            .then(() => device.createDataGroup(
                constants.DATA_GROUP_OBJECT.name,
                constants.DATA_GROUP_OBJECT.records
            ))
            .then(() => {
                const updateArgs = device.bigip.modify.getCall(0).args;
                assert.deepStrictEqual(
                    updateArgs[0],
                    `/tm/ltm/data-group/internal/${constants.DATA_GROUP_OBJECT.name}`
                );
                assert.deepStrictEqual(updateArgs[1].name, constants.DATA_GROUP_OBJECT.name);

                // validate configuration is saved
                const saveArgs = device.bigip.create.getCall(0).args;
                assert.deepStrictEqual(saveArgs[0], '/tm/sys/config');
                assert.deepStrictEqual(saveArgs[1], { command: 'save' });
            })
            .catch(err => Promise.reject(err));
    });
});
