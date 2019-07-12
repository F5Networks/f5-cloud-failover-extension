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

const logger = new Logger(module);


const BigIp = f5CloudLibs.bigIp;
const bigip = new BigIp({ logger });


/**
 * @class Device
 *
 * @description a singleton class which represents BIG IP device
 *
 * @constructor
 */
class Device {
    constructor(options) {
        options = options || {};
        this.hostname = options.hostname || 'localhost';
        this.username = options.username || 'admin';
        this.password = options.password || 'admin';
        this.mgmtPort = options.mgmtPort || '443';
        this.product = options.product || 'BIG-IP';
    }

    /**
    * Initialize the BIG-IP device. Executed by failover.js module
    * and intended for instantiating f5-cloud-libs BIG-IP object
    *
    * @returns {Promise}
    */
    initialize() {
        return bigip.init(
            this.hostname,
            this.username,
            this.password,
            {
                port: this.mgmtPort,
                product: this.product
            }
        );
    }

    /**
    * Retrieves BIG-IP configurations from provided endpoints
    *
    * @param {Array} [endpoints] - list of BIG-IP endpoints used for getting required configuration
    *
    * @returns {Promise}
    */
    getConfig(endpoints) {
        const promises = [];
        for (let i = 0; i < endpoints.length; i += 1) {
            promises.push(bigip.list(endpoints[i]));
        }
        return Promise.all(promises);
    }

    /**
    * Initializes device module configuration
    *
    * @param {Array} [results] - list of config objects recieved by quering BIG-IP endpoints in getConfig method
    *
    */
    initFailoverConfig(results) {
        this.globalSettings = results[0];
        this.trafficGroups = results[1];
        this.selfAddresses = results[2];
        this.virtualAddresses = results[3];

        logger.info('BIG IP Failover configuration has been initialized.');
    }

    /**
    * Intended for getting global settings config object
    *
    *  @returns {Object} global settings config object
    */
    getGlobalSettings() {
        return this.globalSettings;
    }

    /**
    * Intended for getting global traffic groups stats config object
    *
    *  @returns {Object} global traffic groups stats config object
    */
    getTrafficGroupsStats() {
        return this.trafficGroups;
    }

    /**
    * Intended for getting self addresses config object
    *
    *  @returns {Object} self addresses config object
    */
    getSelfAddresses() {
        return this.selfAddresses;
    }


    /**
    * Intended for getting virtual addresses config object
    *
    *  @returns {Object} virtual addresses config object
    */
    getVirtualAddresses() {
        return this.virtualAddresses;
    }
}


module.exports = Device;
