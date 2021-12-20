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

const net = require('net');

const f5CloudLibs = require('@f5devcentral/f5-cloud-libs');

const constants = require('./constants.js');
const util = require('./util.js');
const logger = require('./logger.js');

const cloudUtils = f5CloudLibs.util;
const BigIp = f5CloudLibs.bigIp;

const mgmtPortDiscovery = 'discover';

const DATA_GROUP_URI = '/tm/ltm/data-group/internal';

/**
 * @class Device
 *
 * @description a class which represents a BIG-IP device
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

        this.bigip = new BigIp();
    }

    /**
    * Initialize a BIG-IP device
    *
    * @returns {Promise}
    */
    init() {
        let portPromise;
        if (this.mgmtPort === mgmtPortDiscovery) {
            portPromise = this.discoverMgmtPort();
        } else {
            portPromise = Promise.resolve(this.mgmtPort);
        }

        return portPromise
            .then((port) => {
                this.mgmtPort = port;
            })
            .then(() => this.bigip.init(
                this.hostname,
                this.username,
                this.password,
                {
                    port: this.mgmtPort,
                    product: this.product
                }
            ))
            .then(() => {
                logger.silly('Device initialization complete');
            })
            .catch((err) => Promise.reject(err));
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
            .catch((err) => Promise.reject(err));
    }

    /**
     * Attempt connection to an address:port
     *
     * @param {String} host  - host address
     * @param {Integer} port - host port
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
            .catch((err) => Promise.reject(err));
    }

    /**
    * Retrieves BIG-IP configurations from provided endpoints
    *
    * @param {Array} [endpoints] - list of BIG-IP endpoints used for getting required configuration
    * @param {Object} options - iControlOptions
    *
    * @returns {Promise} resolved promise with REST response
    */
    getConfig(endpoints, options) {
        options = options || {};
        const promises = [];
        for (let i = 0; i < endpoints.length; i += 1) {
            promises.push(this.bigip.list(endpoints[i], options, { maxRetries: 0 }));
        }
        return Promise.all(promises);
    }

    /**
    * Intended for getting CM device information
    *
    * @returns {Promise} resolved promise with REST response
    */
    getCMDeviceInfo() {
        return this.getConfig([
            '/tm/cm/device'
        ])
            .then((results) => Promise.resolve(results[0]))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Intended for getting global settings config object
    *
    * @returns {Promise} resolved promise with REST response
    */
    getGlobalSettings() {
        return this.getConfig([
            '/tm/sys/global-settings'
        ])
            .then((results) => Promise.resolve(results[0]))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Intended for getting proxy settings config object
     *
     * @returns {Promise} resolved promise with REST response
     */
    getProxySettings() {
        return this.getConfig([
            '/tm/sys/db'
        ])
            .then((results) => {
                const settings = {
                    protocol: '',
                    host: '',
                    port: '',
                    username: '',
                    password: ''
                };
                results[0].forEach((element) => {
                    switch (element.name) {
                    case 'proxy.password':
                        settings.password = element.value && element.value !== '<null>' ? element.value : '';
                        break;
                    case 'proxy.username':
                        settings.username = element.value && element.value !== '<null>' ? element.value : '';
                        break;
                    case 'proxy.host':
                        settings.host = element.value && element.value !== '<null>' ? element.value : '';
                        break;
                    case 'proxy.port':
                        settings.port = element.value && element.value !== '<null>' ? element.value : '';
                        break;
                    case 'proxy.protocol':
                        settings.protocol = element.value && element.value !== '<null>' ? element.value : '';
                        break;
                    default:
                        break;
                    }
                });
                logger.silly(`Fetched proxy settings: ${util.stringify(settings)}`);
                return Promise.resolve(settings);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Intended for getting global traffic groups stats config object
    *
    * @returns {Promise} resolved promise with REST response
    */
    getTrafficGroupsStats() {
        return this.getConfig([
            '/tm/cm/traffic-group/stats'
        ])
            .then((results) => Promise.resolve(results[0]))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Intended for getting self addresses config object
    *
    * @returns {Promise} resolved promise with REST response
    */
    getSelfAddresses() {
        return this.getConfig([
            '/tm/net/self'
        ])
            .then((results) => Promise.resolve(results[0]))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Intended for getting virtual addresses config object
    *
    * @returns {Promise} resolved promise with REST response
    */
    getVirtualAddresses() {
        return this.getConfig([
            '/tm/ltm/virtual-address'
        ])
            .then((results) => {
                const virtualAddresses = [];
                results[0].forEach((result) => {
                    if (result.address === 'any') {
                        result.address = '0.0.0.0/0';
                    } else if (result.address === 'any6') {
                        result.address = '::/0';
                    }
                    virtualAddresses.push(result);
                });
                return Promise.resolve(virtualAddresses);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Intended for getting SNAT translation addresses config object
    *
    * Note: ltm/snat-translation endpoint provides addresses stored for both
    * direct SNAT as well as SNAT pools
    *
    * @returns {Promise} resolved promise with REST response
    */
    getSnatTranslationAddresses() {
        return this.getConfig([
            '/tm/ltm/snat-translation'
        ])
            .then((results) => Promise.resolve(results[0]))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Intended for getting NAT addresses config object
    *
    * @returns {Promise} resolved promise with REST response
    */
    getNatAddresses() {
        return this.getConfig([
            '/tm/ltm/nat'
        ])
            .then((results) => Promise.resolve(results[0]))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Get data-group(s) - internal only
    *
    * @param {Object}  options       - Options object for the function
    * @param {String} [options.name] - Name of a specific data group to return
    *
    * @returns {Promise} resolved promise with either 1) the raw REST server response or 2)
    *                    the following object if [options.name] was provided: { 'exists': true, data: {}}
    */
    getDataGroups(options) {
        options = options || {};

        return this.getConfig([DATA_GROUP_URI])
            .then((results) => {
                const dataGroups = results[0];
                if (!options.name) {
                    return Promise.resolve(dataGroups);
                }

                const dataGroupsToReturn = [];
                dataGroups.forEach((dataGroup) => {
                    if (options.name === dataGroup.name) {
                        dataGroupsToReturn.push(dataGroup);
                    }
                });

                // check for the following non happy path conditions:
                // - no data groups matched should resolve with exists:false
                // - more than one data group matched should reject
                if (dataGroupsToReturn.length === 0) {
                    return Promise.resolve({ exists: false, data: {} });
                }
                if (dataGroupsToReturn.length > 1) {
                    const errMsg = `More than one data group match found: ${util.stringify(dataGroupsToReturn)}`;
                    return Promise.reject(new Error(errMsg));
                }

                return Promise.resolve({ exists: true, data: dataGroupsToReturn[0] });
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Create (or update) data-group - internal only
    *
    * @param {String} name   - name of the data group
    * @param {Array} records - the data group records: [{name: 0, data: 'foo'}]
    *
    * @returns {Promise} resolved promise with REST response
    */
    createDataGroup(name, records) {
        const body = {
            name,
            type: 'string',
            records
        };

        return this.getDataGroups({ name })
            .then((response) => {
                if (response.exists === true) {
                    logger.silly(`Modifying existing data group ${name} with body ${util.stringify(body)}`);
                    return this.bigip.modify(`${DATA_GROUP_URI}/${name}`, body);
                }
                logger.silly(`Creating new data group ${name} with body ${util.stringify(body)}`);
                return this.bigip.create(DATA_GROUP_URI, body);
            })
            .then(() => this.saveConfig())
            .catch((err) => Promise.reject(err));
    }

    /**
    * Save configuration (running)
    *
    * @returns {Promise} resolved promise with REST response
    */
    saveConfig() {
        const body = {
            command: 'save'
        };

        return this.bigip.create('/tm/sys/config', body)
            .catch((err) => Promise.reject(err));
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
            .then((response) => response.commandResult)
            .catch((err) => Promise.reject(err));
    }
}

module.exports = Device;
