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

const nock = require('nock');
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
        nock(/.*/)
            .persist()
            .get(/.*/)
            .reply(200, 'Recieved')
            .post(/.*/)
            .reply(201, 'Created');

        device = new Device('localhost', 'admin', 'admin', '443');
        device.initFailoverConfig(mockResults);
    });


    it('validate initialize', (done) => {
        device.initialize('localhost', 'admin', 'admin', '443');
        assert.equal('Created', 'Created');
        done();
    });

    it('validate initFailoverConfig', () => {
        device.initFailoverConfig(mockResults);
        assert.strictEqual(device.globalSettings, 'globalSettings');
        assert.strictEqual(device.trafficGroups, 'trafficGroups');
        assert.strictEqual(device.selfAddresses, 'selfAddresses');
        assert.strictEqual(device.virtualAddresses, 'virtualAddresses');
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
