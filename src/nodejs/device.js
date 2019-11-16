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

const net = require('net');

const f5CloudLibs = require('@f5devcentral/f5-cloud-libs');

const constants = require('./constants.js');
const Logger = require('./logger.js');

const logger = new Logger(module);

const cloudUtils = f5CloudLibs.util;
const BigIp = f5CloudLibs.bigIp;

const mgmtPortDiscovery = 'discover';

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
        this.mgmtPort = options.mgmtPort || mgmtPortDiscovery;
        this.product = options.product || 'BIG-IP';

        this.bigip = new BigIp({ logger });
    }

    /**
    * Initialize the BIG-IP device. Executed by failover.js module
    * and intended for instantiating f5-cloud-libs BIG-IP object
    *
    * @returns {Promise}
    */
    init() {
        let portPromise;
        if (this.mgmtPort === mgmtPortDiscovery) {
            portPromise = this.discoverMgmtPort();
        } else {
            portPromise = Promise.resolve();
        }

        return portPromise
            .then(() => this.bigip.init(
                this.hostname,
                this.username,
                this.password,
                {
                    port: this.mgmtPort,
                    product: this.product
                }
            ))
            .catch(err => Promise.reject(err));
    }

    /**
     * Discover the management address port - the first port
     * (in the defined order) to connect successfully should be returned
     *
     * @returns {Promise} resolved port
     */
    discoverMgmtPort() {
        const portPromises = [];
        constants.MGMT_PORTS.forEach((port) => {
            portPromises.push(this._connectAddress(this.hostname, port));
        });

        return Promise.all(portPromises)
            .then((results) => {
                let port;
                results.reverse().forEach((result) => {
                    if (result.connected === true) {
                        port = result.port;
                    }
                });
                if (port) {
                    return Promise.resolve(port);
                }

                return Promise.reject(new Error('Port discovery failed!'));
            })
            .then((port) => {
                this.mgmtPort = port;
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Attempt connection to an address:port
     *
     * @returns {Promise} { 'connected': true, 'port': 443 }
     */
    _connectAddress(host, port) {
        const socket = net.createConnection({ host, port });

        return new Promise((resolve) => {
            socket.on('connect', () => {
                socket.end();
                resolve({ connected: true, port });
            });
            socket.on('error', () => {
                socket.destroy();
                resolve({ connected: false, port });
            });
        })
            .catch(err => Promise.reject(err));
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
    * Intended for getting global settings config object
    *
    *  @returns {Object} global settings config object
    */
    getGlobalSettings() {
        return this.getConfig([
            '/tm/sys/global-settings'])
            .then(results => Promise.resolve(results[0]))
            .catch(err => Promise.reject(err));
        // return this.globalSettings;
    }

    /**
    * Intended for getting global traffic groups stats config object
    *
    *  @returns {Object} global traffic groups stats config object
    */
    getTrafficGroupsStats() {
        return this.getConfig([
            '/tm/cm/traffic-group/stats'])
            .then(results => Promise.resolve(results[0]))
            .catch(err => Promise.reject(err));
        // return this.trafficGroups;
    }

    /**
    * Intended for getting self addresses config object
    *
    *  @returns {Object} self addresses config object
    */
    getSelfAddresses() {
        return this.getConfig([
            '/tm/net/self'])
            .then(results => Promise.resolve(results[0]))
            .catch(err => Promise.reject(err));

        // return this.selfAddresses;
    }


    /**
    * Intended for getting virtual addresses config object
    *
    *  @returns {Object} virtual addresses config object
    */
    getVirtualAddresses() {
        return this.getConfig([
            '/tm/ltm/virtual-address'])
            .then(results => Promise.resolve(results[0]))
            .catch(err => Promise.reject(err));

        // return this.virtualAddresses;
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
        return this.bigip.create('/tm/util/bash', commandBody, undefined, cloudUtils.NO_RETRY)
            .then(response => response.commandResult)
            .catch(err => Promise.reject(err));
    }
}


module.exports = Device;
