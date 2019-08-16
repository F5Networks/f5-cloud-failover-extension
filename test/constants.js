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

const BASE_ENDPOINT = '/mgmt/shared/cloud-failover';

/**
 * Constants used across two or more files
 *
 * @module
 */
module.exports = {
    restWorker: {
        loadState: (first, cb) => { cb(null); },
        saveState: (first, state, cb) => { cb(null); }
    },
    invalidRestWorker: {
        loadState: (first, cb) => { cb(true); },
        saveState: (first, state, cb) => { cb(null); }
    },
    declarations: {
        basic: {
            class: 'Cloud_Failover',
            environment: 'azure'
        }
    },
    REQUEST: {
        PORT: 443,
        PROTOCOL: 'https'
    },
    BASE_ENDPOINT,
    DECLARE_ENDPOINT: `${BASE_ENDPOINT}/declare`,
    INFO_ENDPOINT: `${BASE_ENDPOINT}/info`,
    TRIGGER_ENDPOINT: `${BASE_ENDPOINT}/trigger`,
    PKG_NAME: 'f5-cloud-failover',
    DEPLOYMENT_FILE_VAR: 'CF_DEPLOYMENT_FILE',
    DEPLOYMENT_FILE: 'deployment_info.json'
};
