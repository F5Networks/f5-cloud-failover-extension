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

const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);

        this.resourceGroup = null;
        this.subscriptionId = null;

        this.networkClient = null;
    }

    /**
    * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
    *
    * @param {Object} options       - function options
    * @param {Array} [options.tags] - array containing tags to filter on [ { 'key': 'value' }]
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || null;
    }

    /**
    * Update Addresses
    *
    * @param {Object} localAddresses    - Local addresses
    * @param {String} failoverAddresses - Failover addresses
    *
    * @returns {Object}
    */
    updateAddresses(localAddresses, failoverAddresses) {
    }
}

module.exports = {
    Cloud
};
