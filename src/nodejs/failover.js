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

const logger = new Logger(module);

/**
 * Execute (primary function)
 *
 */
function execute() {
    return configWorker.getConfig()
        .then((config) => {
            logger.debug(`failover.execute() called: ${util.stringify(config)}`);
        })
        .catch((err) => {
            logger.error(`failover.execute() error: ${util.stringify(err.message)}`);
            return Promise.reject(err);
        });
}

module.exports = {
    execute
};
