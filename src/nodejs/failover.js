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
const constants = require('./constants.js');

const logger = new Logger(module);

const failoverStates = constants.FAILOVER_STATES;
const stateFileName = constants.STATE_FILE_NAME;
const stateFileContents = {
    instance: '',
    configuration: {},
    taskState: failoverStates.PASS,
    timestamp: new Date().toJSON()
};
const RUNNING_TASK_MAX_MS = 10 * 60000; // 10 minutes
const TASK_RETRY_MS = 3 * 1000; // 3 seconds

/**
 * Create state object
 *
 * @param {Object} [options]           - function options
 * @param {String} [options.taskState] - task state
 * @param {String} [options.instance]  - instance name
 *
 * @returns {Object}
 */
function createStateObject(options) {
    const taskState = options.taskState;
    const instance = options.instance;

    const thisState = util.deepCopy(stateFileContents);
    thisState.taskState = taskState;
    thisState.timestamp = new Date().toJSON();
    thisState.instance = instance;
    return thisState;
}

/**
 * Execute (primary function)
 */
function execute() {
    let cloudProvider;
    let hostname;
    let device;
    let config;

    /**
     * Wait for task to complete (or fail/timeout)
     *
     * @returns {Promise}
     */
    function waitForTask() {
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                cloudProvider.downloadDataFromStorage(stateFileName)
                    .then((data) => {
                        logger.silly('State file data: ', data);

                        // initial case - simply create state object in next step
                        if (!data || !data.taskState) {
                            clearInterval(interval);
                            resolve({ recoverPreviousTask: false });
                        }
                        // success - no need to wait for task
                        if (data.taskState === failoverStates.PASS) {
                            clearInterval(interval);
                            resolve({ recoverPreviousTask: false });
                        }
                        // running - continute to wait
                        if (data.taskState === failoverStates.RUNNING) {
                            // waiting...
                        }
                        if (data.taskState === failoverStates.FAIL) {
                            // TODO: recover from failed state here...
                        }

                        // enforce maximum time allotment
                        const timeDrift = new Date() - Date.parse(data.timeStamp);
                        if (timeDrift > RUNNING_TASK_MAX_MS) {
                            clearInterval(interval);
                            reject(new Error(`Time drift exceeded maximum limit: ${timeDrift}`));
                        }
                    })
                    .catch((err) => {
                        clearInterval(interval);
                        reject(err);
                    });
            }, TASK_RETRY_MS);
        });
    }

    return configWorker.getConfig()
        .then((data) => {
            config = data;
            if (!config.environment) {
                const err = new Error('Environment not provided');
                return Promise.reject(err);
            }

            cloudProvider = CloudFactory.getCloudProvider(config.environment, { logger });
            return cloudProvider.init({
                tags: util.getDataByKey(config, 'failoverAddresses.scopingTags'),
                routeTags: util.getDataByKey(config, 'failoverRoutes.scopingTags'),
                routeAddresses: util.getDataByKey(config, 'failoverRoutes.scopingAddressRanges'),
                routeSelfIpsTag: 'F5_SELF_IPS',
                storageTags: util.getDataByKey(config, 'externalStorage.scopingTags')
            });
        })
        .then(() => {
            device = new Device({
                hostname: 'localhost',
                username: 'admin',
                password: 'admin',
                port: '443'
            });
            return device.initialize();
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

            // wait for task - handles all possible states
            return waitForTask();
        })
        .then(() => {
            const stateFile = createStateObject({ taskState: failoverStates.RUNNING, instance: hostname });
            return cloudProvider.uploadDataToStorage(stateFileName, stateFile);
        })
        .then(() => {
            const trafficGroups = getTrafficGroups(device.getTrafficGroupsStats(), hostname);
            const selfAddresses = getSelfAddresses(device.getSelfAddresses(), trafficGroups);
            const virtualAddresses = getVirtualAddresses(device.getVirtualAddresses(), trafficGroups);
            return getFailoverAddresses(selfAddresses, virtualAddresses);
        })
        .then((addresses) => {
            logger.info('Performing Failover');
            const actions = [
                cloudProvider.updateAddresses(addresses.localAddresses, addresses.failoverAddresses)
            ];
            // updating routes is conditional - TODO: rethink this...
            const routeFeatureEnvironments = [constants.CLOUD_PROVIDERS.AZURE];
            if (config.environment.indexOf(routeFeatureEnvironments) !== -1) {
                actions.push(cloudProvider.updateRoutes({ localAddresses: addresses.localAddresses }));
            }
            return Promise.all(actions);
        })
        .then(() => {
            const stateFile = createStateObject({ taskState: failoverStates.PASS, instance: hostname });
            return cloudProvider.uploadDataToStorage(stateFileName, stateFile);
        })
        .then(() => {
            logger.info('Failover complete');
        })
        .catch((err) => {
            logger.error(`failover.execute() error: ${util.stringify(err.message)}`);

            const stateFile = createStateObject({ taskState: failoverStates.FAIL, instance: hostname });
            return cloudProvider.uploadDataToStorage(stateFileName, stateFile)
                .then(() => Promise.reject(err))
                .catch((innerErr) => {
                    logger.error(`failover.execute() uploadDataToStorage error: ${util.stringify(innerErr.message)}`);
                    return Promise.reject(err);
                });
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
        const local = entries[key].nestedStats.entries.deviceName.description.indexOf(hostname) !== -1
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
            if (nestedItem.name.indexOf(item.trafficGroup) !== -1) {
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
                if (nestedItem.name.indexOf(addressTrafficGroup) !== -1) {
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
