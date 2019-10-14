/**
 * Copyright 2018 F5 Networks, Inc.
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
const Device = require('../../src/nodejs/device');

const mockResults = [
    'globalSettings',
    'trafficGroups',
    'selfAddresses',
    'virtualAddresses'
];

describe('Device', () => {
    let device;

    beforeEach(() => {
        device = new Device();
        device.bigip.init = sinon.stub().resolves();
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


    it('validate initialize', () => {
        device.getConfig = sinon.stub().resolves(mockResults);
        return device.init()
            .then(() => {
                assert.ok(true);
            })
            .catch(err => Promise.reject(err));
    });

    it('validate getConfig', () => {
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


    it('validate getGlobalSettings', () => {
        device.getConfig = sinon.stub().resolves(mockResults);
        return device.init()
            .then(() => {
                assert.strictEqual(device.getGlobalSettings(), 'globalSettings');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate getTrafficGroupsStats', () => {
        device.getConfig = sinon.stub().resolves(mockResults);
        return device.init()
            .then(() => {
                assert.strictEqual(device.getTrafficGroupsStats(), 'trafficGroups');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate getSelfAddresses', () => {
        device.getConfig = sinon.stub().resolves(mockResults);
        return device.init()
            .then(() => {
                assert.strictEqual(device.getSelfAddresses(), 'selfAddresses');
            })
            .catch(err => Promise.reject(err));
    });

    it('validate getVirtualAddresses', () => {
        device.getConfig = sinon.stub().resolves(mockResults);
        return device.init()
            .then(() => {
                assert.strictEqual(device.getVirtualAddresses(), 'virtualAddresses');
            })
            .catch(err => Promise.reject(err));
    });
});
