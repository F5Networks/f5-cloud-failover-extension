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

const cloudUtils = f5CloudLibs.util;
const BigIp = f5CloudLibs.bigIp;


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
        this.bigip = new BigIp({ logger });
        return this.bigip.init(
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
            promises.push(this.bigip.list(endpoints[i]));
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

    /**
     * Calls the util/bash iControl endpoint, to execute a bash script, using the BIG-IP client
     *
     * @param {String}      command - Bash command for BIG-IP to execute
     *
     * @returns {Promise}   A promise which is resolved when the request is complete
     *                      or rejected if an error occurs.
     */
    executeBigIpBashCmd(command) {
        const commandBody = {
            command: 'run',
            utilCmdArgs: `-c ${command}`
        };
        return this.bigip.create('/tm/util/bash', commandBody, undefined, cloudUtils.NO_RETRY);
    }
}


module.exports = Device;
