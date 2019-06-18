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

    return configWorker.getConfig()
        .then((config) => {
            logger.debug(`failover.execute() called: ${util.stringify(config)}`);

            // get cloud provider from config - need to put this logic elsewhere, configWorker?
            let initClass;
            Object.keys(config).forEach((key) => {
                if (config[key].class && config[key].class === 'Initialize') {
                    initClass = config[key];
                }
            });
            cloudProvider = CloudFactory.getCloudProvider(initClass.environment, { logger });

            return cloudProvider.init(initClass);
        })
        .then(() => {
            logger.info('Cloud provider has been initialized');
        })
        .then(() => {
            logger.info('BIG-IP has been initialized');
        })
        .then(() => {
            logger.info('Get traffic group addresses');
        })
        .then(() => {
            logger.info('Updating addresses/routes');
        })
        .catch((err) => {
            logger.error(`failover.execute() error: ${util.stringify(err.message)}`);
            return Promise.reject(err);
        });
}

module.exports = {
    execute
};
