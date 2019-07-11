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

let device;


describe('device', () => {
    beforeEach(() => {
        device = new Device('localhost', 'admin', 'admin', '443');
        device.initialize = sinon.stub().returns('Initialized');
        device.getConfig = sinon.stub().returns('ConfigRecieved');
        device.initFailoverConfig(mockResults);
    });

    it('validate initialize', () => {
        assert.equal('Initialized', device.initialize('localhost', 'admin', 'admin', '443'));
    });

    it('validate initFailoverConfig', () => {
        device.initFailoverConfig(mockResults);
        assert.strictEqual(device.globalSettings, 'globalSettings');
        assert.strictEqual(device.trafficGroups, 'trafficGroups');
        assert.strictEqual(device.selfAddresses, 'selfAddresses');
        assert.strictEqual(device.virtualAddresses, 'virtualAddresses');
    });

    it('validate getConfig', () => {
        assert.equal('ConfigRecieved', device.getConfig([
            '/tm/sys/global-settings',
            '/tm/cm/traffic-group/stats',
            '/tm/net/self',
            '/tm/ltm/virtual-address'
        ]));
    });

    it('validate getGlobalSettings', () => {
        assert.strictEqual(device.getGlobalSettings(), 'globalSettings');
    });

    it('validate getTrafficGroupsStats', () => {
        assert.strictEqual(device.getTrafficGroupsStats(), 'trafficGroups');
    });

    it('validate getSelfAddresses', () => {
        assert.strictEqual(device.getSelfAddresses(), 'selfAddresses');
    });

    it('validate getVirtualAddresses', () => {
        assert.strictEqual(device.getVirtualAddresses(), 'virtualAddresses');
    });
});
