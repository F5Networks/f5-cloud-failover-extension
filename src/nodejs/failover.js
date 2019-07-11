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

const Device = require('./device.js');
const Logger = require('./logger.js');
const util = require('./util.js');
const configWorker = require('./config.js');
const CloudFactory = require('./providers/cloudFactory.js');

const logger = new Logger(module);

/**
 * Execute (primary function)
 *
 */
function execute() {
    let cloudProvider;
    let hostname;
    let device;

    return configWorker.getConfig()
        .then((config) => {
            if (!config.environment) {
                const err = new Error('Environment not provided');
                return Promise.reject(err);
            }

            cloudProvider = CloudFactory.getCloudProvider(config.environment, { logger });
            return cloudProvider.init({ tags: config.addressTags });
        })
        .then(() => {
            logger.info('Cloud provider has been initialized');
        })
        .then(() => {
            device = new Device('localhost', 'admin', 'admin', '443', 'BIG-IP');
            return device.initialize();
        })
        .then(() => {
            logger.info('BIG-IP has been initialized');
        })
        .then(() => device.getConfig([
            '/tm/sys/global-settings',
            '/tm/cm/traffic-group/stats',
            '/tm/net/self',
            '/tm/ltm/virtual-address'
        ]))
        .then((results) => {
            device.initFailoverConfig(results);
            hostname = device.getGlobalSettings().hostname;
            const trafficGroups = getTrafficGroups(device.getTrafficGroupsStats(), hostname);
            const selfAddresses = getSelfAddresses(device.getSelfAddresses(), trafficGroups);
            const virtualAddresses = getVirtualAddresses(device.getVirtualAddresses(), trafficGroups);
            return getFailoverAddresses(selfAddresses, virtualAddresses);
        })
        .then((addresses) => {
            logger.info('Performing Failover - Updating addresses');

            return cloudProvider.updateAddresses(addresses.localAddresses, addresses.failoverAddresses);
        })
        .then(() => {
            logger.info('Failover complete');
        })
        .catch((err) => {
            logger.error(`failover.execute() error: ${util.stringify(err.message)}`);
            return Promise.reject(err);
        });
}

/**
* Get traffic groups (local)
*
* @param {Object} trafficGroupStats - The traffic group stats as returned by the device
* @param {String} hostname          - The hostname of the device
*
* @returns {Object}
*/
function getTrafficGroups(trafficGroupStats, hostname) {
    const trafficGroups = [];

    const entries = trafficGroupStats.entries;
    Object.keys(entries).forEach((key) => {
        const local = entries[key].nestedStats.entries.deviceName.description.includes(hostname)
            && entries[key].nestedStats.entries.failoverState.description === 'active';

        if (local) {
            trafficGroups.push({
                name: entries[key].nestedStats.entries.trafficGroup.description
            });
        }
    });
    return trafficGroups;
}

/**
* Get self addresses
*
* @param {Object} selfAddresses - Self addresses
* @param {Object} trafficGroups - Traffic groups
*
* @returns {Object}
*/
function getSelfAddresses(selfAddresses, trafficGroups) {
    const addresses = [];

    selfAddresses.forEach((item) => {
        let trafficGroupMatch = false;
        trafficGroups.forEach((nestedItem) => {
            if (nestedItem.name.includes(item.name)) {
                trafficGroupMatch = true;
            }
        });

        addresses.push({
            address: item.address.split('/')[0].split('%')[0],
            trafficGroup: item.trafficGroup,
            trafficGroupMatch
        });
    });
    return addresses;
}

/**
* Get virtual addresses
*
* @param {Object} virtualAddresses - Virtual addresses
* @param {Object} trafficGroups - Traffic groups
*
* @returns {Object}
*/
function getVirtualAddresses(virtualAddresses, trafficGroups) {
    const addresses = [];

    if (!virtualAddresses.length) {
        logger.error('No virtual addresses exist, create them prior to failover.');
    } else {
        virtualAddresses.forEach((item) => {
            const address = item.address.split('%')[0];
            const addressTrafficGroup = item.trafficGroup;

            trafficGroups.forEach((nestedItem) => {
                if (nestedItem.name.includes(addressTrafficGroup)) {
                    addresses.push({
                        address
                    });
                }
            });
        });
    }
    return addresses;
}

/**
* Get failover addresses
*
* @param {Object} selfAddresses   - Self addresses
* @param {Object} virtualAddresses - Virtual addresses
*
* @returns {Object}
*/
function getFailoverAddresses(selfAddresses, virtualAddresses) {
    const localAddresses = [];
    const failoverAddresses = [];

    // go through all self addresses and add address to appropriate array
    selfAddresses.forEach((item) => {
        if (item.trafficGroupMatch) {
            failoverAddresses.push(item.address);
        } else {
            localAddresses.push(item.address);
        }
    });
    // go through all virtual addresses and add address to appropriate array
    virtualAddresses.forEach((item) => {
        failoverAddresses.push(item.address);
    });

    return {
        localAddresses,
        failoverAddresses
    };
}

module.exports = {
    execute
};
