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

const f5CloudLibs = require('@f5devcentral/f5-cloud-libs');

const Logger = require('./logger.js');
const util = require('./util.js');

const logger = new Logger(module);


const BigIp = f5CloudLibs.bigIp;
const bigip = new BigIp({ logger });

class Device {
    constructor(hostname, username, password, mgmtPort) {
        // this.initialize(hostname, username, password, mgmtPort);
        this.hostname = hostname;
        this.username = username;
        this.password = password;
        this.mgmtPort = mgmtPort;
    }

    initialize(hostname, username, password, mgmtPort) {
        return bigip.init(
            hostname,
            username,
            password,
            {
                port: mgmtPort,
                product: 'BIG-IP'
            }
        )
    }

    getConfig() {
        return Promise.all([
            bigip.list('/tm/sys/global-settings'),
            bigip.list('/tm/cm/traffic-group/stats'),
            bigip.list('/tm/net/self'),
            bigip.list('/tm/ltm/virtual-address')
        ]);
    }

    initFailoverConfig(results) {
        this.globalSettings = results[0];
        this.trafficGroups = results[1];
        this.selfAddresses = results[2];
        this.virtualAddresses = results[3];

        logger.info('BIG IP Failover configuration has been initialized.');
    }

    getGlobalSettings() {
        return this.globalSettings;
    }

    getTrafficGroupsStats() {
        return this.trafficGroups;
    }

    getSelfAddresses() {
        return this.selfAddresses;
    }

    getVirtualAddresses() {
        return this.virtualAddresses;
    }
}


module.exports = Device;
