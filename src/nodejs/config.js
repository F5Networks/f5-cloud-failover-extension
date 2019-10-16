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

const util = require('./util.js');
const Logger = require('./logger.js');
const Validator = require('./validator.js');
const Device = require('./device.js');
const constants = require('./constants.js');

const PATHS = constants.PATHS;

const logger = new Logger(module);

const DFL_CONFIG_IN_STATE = {
    config: {},
    taskState: {}
};

class ConfigWorker {
    constructor() {
        this.state = DFL_CONFIG_IN_STATE;
        this.validator = new Validator();

        this._restWorker = null;
    }

    /**
     * Initialize (state, etc.)
     *
     * @param {Object} restWorker
     */
    init(restWorker) {
        this._restWorker = restWorker;

        return new Promise((resolve, reject) => {
            this._restWorker.loadState(null, (err, state) => {
                if (err) {
                    const message = `error loading state: ${err.message}`;
                    logger.warning(message);
                    reject(err);
                }
                resolve(state);
            });
        })
            .then((state) => {
                this.state = state || DFL_CONFIG_IN_STATE;
            })
            .catch((err) => {
                logger.error(`Could not initialize state: ${util.stringify(err.message)}`);
                return Promise.reject(err);
            });
    }

    /**
     * Get Configuration
     *
     */
    getConfig() {
        return Promise.resolve(this.state.config);
    }

    /**
     * Set Configuration
     *
     * @param {Object} config
     */
    setConfig(config) {
        this.state.config = config;
        // save to persistent storage
        return new Promise((resolve, reject) => {
            this._restWorker.saveState(null, this.state, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        })
            .catch((err) => {
                logger.error(`Could not set config: ${util.stringify(err.message)}`);
                return Promise.reject(err);
            });
    }

    /**
     * Get task state
     *
     */
    getTaskState() {
        return Promise.resolve(this.state.taskState);
    }

    /**
     * Set task state
     *
     * @param {Object} taskState
     */
    setTaskState(taskState) {
        this.state.taskState = taskState || {};
        // save to persistent storage
        return new Promise((resolve, reject) => {
            this._restWorker.saveState(null, this.state, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        })
            .catch((err) => {
                logger.error(`Could not set task state: ${util.stringify(err.message)}`);
                return Promise.reject(err);
            });
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
     * @param {String}  scriptPath  - Path to the specific failover trigger script to update
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
                if (contents.indexOf(`\n${constants.LEGACY_TRIGGER_COMMAND}`) !== -1) {
                    contents = contents.replace(
                        `\n${constants.LEGACY_TRIGGER_COMMAND}`,
                        `\n${constants.LEGACY_TRIGGER_COMMENT}\n#${constants.LEGACY_TRIGGER_COMMAND}`
                    );
                }
                // finally, insert failover trigger command
                contents = contents.concat(`\n${constants.TRIGGER_COMMENT}\n${constants.TRIGGER_COMMAND}`);
                return this.device.executeBigIpBashCmd(`'echo "${contents}" > ${scriptPath}'`);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Process Configuration
     *
     * @param {Object} body
     */
    processConfigRequest(body) {
        const declaration = Object.assign({}, body);
        const validation = this.validator.validate(declaration);

        if (!validation.isValid) {
            const error = new Error(`Invalid declaration: ${JSON.stringify(validation.errors)}`);
            return Promise.reject(error);
        }

        logger.debug('Successfully validated declaration');
        this.setConfig(declaration);

        this.device = new Device();

        return this.device.init()
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
