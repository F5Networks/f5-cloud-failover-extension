/**
 * Copyright 2019 F5 Networks, Inc.
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

const CLOUD_PROVIDERS = require('../constants').CLOUD_PROVIDERS;

/* eslint-disable global-require */
let AzureCloud;
let GoogleCloud;
let AWSCloud;

/**
 * Given the name of a Cloud Provider return a Cloud Instance.
 * @param {String} providerName     - Short name of the cloud provider
 * @param {Object} [options]        - Optional parameters
 * @param {Object} [options.logger] - Logger to use
 */
function getCloudProvider(providerName, options) {
    switch (providerName) {
    case CLOUD_PROVIDERS.AZURE:
        AzureCloud = require('./azure/cloud.js').Cloud;
        return new AzureCloud(options);
    case CLOUD_PROVIDERS.GCP:
        GoogleCloud = require('./gcp/cloud.js').Cloud;
        return new GoogleCloud(options);
    case CLOUD_PROVIDERS.AWS:
        AWSCloud = require('./aws/cloud.js').Cloud;
        return new AWSCloud(options);
    default:
        throw new Error('Unsupported cloud');
    }
}

module.exports = {
    getCloudProvider
};
