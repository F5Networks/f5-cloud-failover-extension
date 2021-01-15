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

const path = require('path');

const PKG_JSON = require('../package.json');
const constants = require('../src/nodejs/constants.js');

const BASE_ENDPOINT = '/mgmt/shared/cloud-failover';
const EXAMPLE_DECLARATIONS = {
    basic: {
        class: 'Cloud_Failover',
        environment: 'azure',
        failoverAddresses: {
            enabled: true,
            scopingTags: {
                f5_cloud_failover_label: 'test'
            }
        },
        failoverRoutes: {
            enabled: true,
            scopingTags: {
                f5_cloud_failover_label: 'test'
            },
            scopingAddressRanges: [
                {
                    range: '192.0.2.0/24',
                    nextHopAddresses: {
                        discoveryType: 'static',
                        items: [
                            '1.1.1.1',
                            '2.2.2.2'
                        ]
                    }
                }
            ]
        }
    },
    basicWithLogging: {
        class: 'Cloud_Failover',
        environment: 'azure',
        failoverAddresses: {
            enabled: true,
            scopingTags: {
                f5_cloud_failover_label: 'test'
            }
        },
        failoverRoutes: {
            enabled: true,
            scopingTags: {
                f5_cloud_failover_label: 'test'
            },
            scopingAddressRanges: [
                {
                    range: '192.0.2.0/24',
                    nextHopAddresses: {
                        discoveryType: 'static',
                        items: [
                            '1.1.1.1',
                            '2.2.2.2'
                        ]
                    }
                }
            ]
        },
        controls: {
            class: 'Controls',
            logLevel: 'info'
        }
    },
    basicWithRetryFailover: {
        class: 'Cloud_Failover',
        environment: 'azure',
        failoverAddresses: {
            enabled: true,
            scopingTags: {
                f5_cloud_failover_label: 'test'
            }
        },
        failoverRoutes: {
            enabled: true,
            scopingTags: {
                f5_cloud_failover_label: 'test'
            },
            scopingAddressRanges: [
                {
                    range: '192.0.2.0/24',
                    nextHopAddresses: {
                        discoveryType: 'static',
                        items: [
                            '1.1.1.1',
                            '2.2.2.2'
                        ]
                    }
                }
            ]
        },
        retryFailover: {
            enabled: true,
            interval: 60000
        }
    }
};

/**
 * Constants used across two or more files
 *
 * @module
 */
module.exports = {
    PKG_NAME: PKG_JSON.name,
    PKG_VERSION: PKG_JSON.version,
    PKG_MIN_VERSION: '0.9.1',
    ARTIFACTS_LOGS_DIR: path.join(process.cwd(), 'logs'),
    declarations: EXAMPLE_DECLARATIONS,
    DATA_GROUP_OBJECT: {
        name: 'f5-cloud-failover-store',
        records: [
            {
                name: 'state',
                data: Buffer.from(
                    JSON.stringify({ config: EXAMPLE_DECLARATIONS.basic })
                ).toString('base64')
            }
        ]
    },
    REQUEST: {
        PORT: 443,
        PROTOCOL: 'https'
    },
    BASE_ENDPOINT,
    DECLARE_ENDPOINT: `${BASE_ENDPOINT}/declare`,
    INFO_ENDPOINT: `${BASE_ENDPOINT}/info`,
    TRIGGER_ENDPOINT: `${BASE_ENDPOINT}/trigger`,
    RESET_ENDPOINT: `${BASE_ENDPOINT}/reset`,
    INSPECT_ENDPOINT: `${BASE_ENDPOINT}/inspect`,
    DEPLOYMENT_FILE_VAR: 'CF_DEPLOYMENT_FILE',
    DEPLOYMENT_FILE: 'deployment_info.json',
    FAILOVER_STATES: constants.FAILOVER_STATES,
    RETRIES: {
        LONG: 500,
        MEDIUM: 100,
        SHORT: 10
    },
    FEATURE_FLAG_KEY_NAMES: constants.FEATURE_FLAG_KEY_NAMES,
    ENVIRONMENT_KEY_NAME: constants.ENVIRONMENT_KEY_NAME,
    TELEMETRY_TYPE: constants.TELEMETRY_TYPE,
    TELEMETRY_TYPE_VERSION: constants.TELEMETRY_TYPE_VERSION,
    TRIGGER_COMMENT: constants.TRIGGER_COMMENT,
    TRIGGER_COMMAND: constants.TRIGGER_COMMAND,
    LEGACY_TRIGGER_COMMENT: '# Disabled by F5 Failover Extension',
    LEGACY_TRIGGER_COMMAND: {
        AZURE: '/usr/bin/f5-rest-node /config/cloud/azure/node_modules/@f5devcentral/f5-cloud-libs-azure/scripts/failoverProvider.js',
        GCP: '/usr/bin/f5-rest-node /config/cloud/gce/node_modules/@f5devcentral/f5-cloud-libs-gce/scripts/failover.js'
    },
    STATE_FILE_RESET_MESSAGE: 'Failover state file was reset',
    LOG_LEVELS: {
        silly: 0,
        verbose: 1,
        debug: 2,
        info: 3,
        warning: 4,
        error: 5
    }
};
