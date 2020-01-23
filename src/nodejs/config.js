/**
 * Copyright 2020 F5 Networks, Inc.
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

const util = require('./util.js');
const logger = require('./logger.js');
const Validator = require('./validator.js');
const Device = require('./device.js');
const constants = require('./constants.js');

const PATHS = constants.PATHS;
const STATE_DATA_GROUP_NAME = 'f5-cloud-failover-state';
const DFL_OBJECT_IN_STATE = {
    config: {}
};

class ConfigWorker {
    constructor() {
        this.state = DFL_OBJECT_IN_STATE;
        this.validator = new Validator();
        this.device = new Device();
    }

    /**
     * Initialize (state, etc.)
     *
     * @returns {Promise} A promise which is resolved when initialization is complete
     */
    init() {
        return this.device.init()
            .then(() => this._loadStateFromStore())
            .then((state) => {
                this.state = state;
            })
            .catch((err) => {
                logger.error(`Could not initialize state: ${util.stringify(err.message)}`);
                return Promise.reject(err);
            });
    }

    /**
     * Get Configuration
     *
     * @returns {Promise} The configuration
     */
    getConfig() {
        return this._loadStateFromStore()
            .then(state => Promise.resolve(state.config))
            .catch(err => Promise.reject(err));
    }

    /**
     * Set Configuration
     *
     * @param {Object} config
     *
     * @returns {Promise} A promise which is resolved when the configuration has been set
     */
    setConfig(config) {
        this.state.config = config || {};

        return this._saveStateToStore(this.state)
            .catch((err) => {
                logger.error(`Could not set config: ${util.stringify(err.message)}`);
                return Promise.reject(err);
            });
    }

    /**
     * Parse state out of data group
     *
     * @param {Object} dataGroup - data group object to parse
     *
     * @returns {Object} The parsed state object
     */
    _parseStateFromDataGroup(dataGroup) {
        let state = DFL_OBJECT_IN_STATE;
        try {
            if (dataGroup) {
                state = JSON.parse(util.base64('decode', dataGroup.records[0].data));
            }
        } catch (err) {
            logger.warning(`Error parsing state: ${err.message}`);
        }
        return state;
    }

    /**
     * Load stateful configuration from persistent "store"
     *
     * @returns {Promise} The loaded configuration
     */
    _loadStateFromStore() {
        return this.device.getDataGroups({ name: STATE_DATA_GROUP_NAME })
            .then((dataGroup) => {
                if (dataGroup.exists === false) {
                    return Promise.resolve(DFL_OBJECT_IN_STATE);
                }
                return Promise.resolve(this._parseStateFromDataGroup(dataGroup.data));
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Save stateful configuration to persistent "store"
     * Saved as a single base64 encoded data group record
     *
     * @param {Object} state - the state object to save to store
     *
     * @returns {Promise} A promise which is resolved when the configuration is saved
     */
    _saveStateToStore(state) {
        return this.device.createDataGroup(
            STATE_DATA_GROUP_NAME,
            [
                {
                    name: 'state',
                    data: util.base64('encode', util.stringify(state))
                }
            ]
        )
            .then(() => Promise.resolve({ saved: true }))
            .catch(err => Promise.reject(err));
    }

    /**
     * Update the failover trigger scripts, stored on the BIG-IP's local filesystem, to call the Failover
     * Extension 'trigger' endpoint upon a failover event
     *
     * @returns {Promise}   A promise which is resolved when the request is complete
     *                      or rejected if an error occurs.
     */
    _updateTriggerScripts() {
        return Promise.all([
            this._updateTriggerScript(PATHS.tgactive),
            this._updateTriggerScript(PATHS.tgrefresh)
        ])
            .then(() => {
                logger.info('Successfully wrote Failover trigger scripts to filesystem');
            })
            .catch((err) => {
                logger.error(`Could not update Failover trigger scripts: ${util.stringify(err.message)}`);
                return Promise.reject(err);
            });
    }

    /**
     * Get the contents of the current script from the BIG-IP's local filesystem, then
     * 1) If CF static comment is not in the file append CF trigger call
     * 2) If legacy failover script call is in the file, disable it (comment it out)
     *
     * @param {String} scriptPath - Path to the specific failover trigger script to update
     *
     * @returns {Promise} A promise which is resolved when the script update is complete
     *                    or rejected if an error occurs.
     */
    _updateTriggerScript(scriptPath) {
        return this.device.executeBigIpBashCmd(`'cat ${scriptPath}'`)
            .then((contents) => {
                // check if trigger command has already been written first
                if (contents.indexOf(constants.TRIGGER_COMMENT) !== -1) {
                    return Promise.resolve();
                }
                // check if legacy failover script call needs to be disabled
                constants.LEGACY_TRIGGER_COMMANDS.forEach((command) => {
                    if (contents.indexOf(`\n${command}`) !== -1) {
                        contents = contents.replace(
                            `\n${command}`,
                            `\n${constants.LEGACY_TRIGGER_COMMENT}\n#${command}`
                        );
                    }
                });
                // finally, insert failover trigger command
                contents = contents.concat(`\n${constants.TRIGGER_COMMENT}\n${constants.TRIGGER_COMMAND}`);
                return this.device.executeBigIpBashCmd(`'echo "${contents}" > ${scriptPath}'`);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Process Configuration
     *
     * @param {Object} body - the http request body to process
     */
    processConfigRequest(body) {
        const declaration = Object.assign({}, body);
        const validation = this.validator.validate(declaration);

        if (!validation.isValid) {
            const error = new Error(`Invalid declaration: ${JSON.stringify(validation.errors)}`);
            return Promise.reject(error);
        }

        logger.debug('Successfully validated declaration');

        // Update log level based on controls property, if necessary
        if (declaration.controls && declaration.controls.logLevel) {
            logger.setLogLevel(declaration.controls.logLevel);
        }

        return this.setConfig(declaration)
            .then(() => this._updateTriggerScripts())
            .then(() => Promise.resolve(this.state.config))
            .catch((err) => {
                logger.error(`Could not process configuration declaration: ${JSON.stringify(err.message)}`);
                return Promise.reject(err);
            });
    }
}

// initialize singleton
module.exports = new ConfigWorker();
