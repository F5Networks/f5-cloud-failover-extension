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

const util = require('./util.js');
const Logger = require('./logger.js');
const Validator = require('./validator.js');

const logger = new Logger(module);
const BigIp = f5CloudLibs.bigIp;
const bigip = new BigIp({ logger });

const DFL_CONFIG_IN_STATE = {
    config: {}
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
            .then(() => {
                bigip.init(
                    'localhost',
                    'admin',
                    'admin',
                    {
                        port: '443',
                        product: 'BIG-IP'
                    }
                )
            })
            .then(() => {
                logger.debug('BIG-IP has been initialized');
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

        // return declaration to user
        return Promise.resolve(this.state.config);
    }
}

// initialize singleton
module.exports = new ConfigWorker();
