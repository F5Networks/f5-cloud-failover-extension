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

const Logger = require('../../logger.js');
const utils = require('../../util.js');

const constants = require('../../constants');

/**
 * Abstract Cloud class - defines cloud agnostic properties and methods
 *
 * @class
 */

class AbstractCloud {
    constructor(name, options) {
        this.environment = name;

        this.maxRetries = constants.MAX_RETRIES;
        this.retryInterval = constants.RETRY_INTERVAL;


        const logger = options ? options.logger : Logger;
        if (logger) {
            this.logger = logger;
        }
    }

    /**
    * Initialize the Cloud Provider
    *
    * @param {Object} options                         - function options
    * @param {Object} [options.tags]                  - tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeTags]             - tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeAddressRanges]    - addresses to filter on [{ 'range': '192.0.2.0/24' }]
    *                                                   with next hop address discovery configuration:
    *                                                     { 'type': 'address': 'items': [], tag: null}
    * @param {Object} [options.storageTags]           - storage tags to filter on { 'key': 'value' }
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || {};
        this.routeTags = options.routeTags || {};
        this.routeAddressRanges = options.routeAddressRanges || [];
        this.storageTags = options.storageTags || {};
    }

    uploadDataToStorage() {
        throw new Error('Method must be implemented in child class!');
    }

    downloadDataFromStorage() {
        throw new Error('Method must be implemented in child class!');
    }

    updateAddresses() {
        throw new Error('Method must be implemented in child class!');
    }

    updateRoutes() {
        throw new Error('Method must be implemented in child class!');
    }

    getAssociatedAddressAndRouteInfo() {
        throw new Error('Method must be implemented in child class!');
    }

    /**
    * Discover next hop address - support 'none' (static) and routeTag discovery types
    *
    * @param {Object} localAddresses          - local addresses
    * @param {Object} routeTableTags          - route table tags
    * @param {Object} discoveryOptions        - discovery options
    * @param {String} [discoveryOptions.type] - type of discovery: address|routeTag
    * @param {Array} [discoveryOptions.items] - items, used for some discovery types
    * @param {String} [discoveryOptions.tag]  - tag, used for some discovery types
    *
    * @returns {String} - next hop address
    */
    _discoverNextHopAddress(localAddresses, routeTableTags, discoveryOptions) {
        let potentialAddresses = [];

        switch (discoveryOptions.type) {
        case 'static':
            potentialAddresses = discoveryOptions.items;
            break;
        case 'routeTag':
            routeTableTags = this._normalizeTags(routeTableTags);
            if (!routeTableTags[discoveryOptions.tag]) {
                this.logger.warning(`expected tag: ${discoveryOptions.tag} does not exist on route table`);
            }
            // tag value may be '1.1.1.1,2.2.2.2' or ['1.1.1.1', '2.2.2.2']
            if (Array.isArray(routeTableTags[discoveryOptions.tag])) {
                potentialAddresses = routeTableTags[discoveryOptions.tag];
            } else {
                potentialAddresses = routeTableTags[discoveryOptions.tag].split(',').map(i => i.trim());
            }
            break;
        default:
            throw new Error(`Invalid discovery type was provided: ${discoveryOptions.type}`);
        }

        const nextHopAddressToUse = potentialAddresses.filter(item => localAddresses.indexOf(item) !== -1)[0];
        if (!nextHopAddressToUse) {
            this.logger.warning(`Next hop address to use is empty: ${localAddresses} ${potentialAddresses}`);
        }

        this.logger.silly(`Next hop address: ${nextHopAddressToUse}`);
        return nextHopAddressToUse;
    }

    /**
     * Returns route address range and next hop addresses config info given the route's
     * destination cidr
     *
     * @param cidr             - Cidr to match against routeAddressRanges.routeAddresses
     * @return {Object|null}
     *
     */

    _matchRouteToAddressRange(cidr) {
        // simply compare this cidr to the route address ranges array and look for a match
        const matchingRouteAddressRange = this.routeAddressRanges.filter(
            routeAddressRange => routeAddressRange.routeAddresses.indexOf(cidr) !== -1
        );
        return matchingRouteAddressRange.length ? matchingRouteAddressRange[0] : null;
    }

    /**
    * Normalize tags into a known object structure
    *
    * Known unique object structures
    * - { 'key1': 'value1' }
    * - [{ 'Key': 'key1', 'Value': 'value1' }]
    *
    * @param {Object|Array} tags - cloud resource tags
    *
    * @returns {Object} - tags: { 'key1': 'value1' }
    */
    _normalizeTags(tags) {
        let ret = {};
        if (Array.isArray(tags)) {
            ret = tags.reduce((acc, cur) => {
                acc[cur.Key] = cur.Value;
                return acc;
            }, {});
        } else {
            ret = tags;
        }
        return ret;
    }

    /**
     * Retrier function
     *
     * Note: Wrapper for utils.retrier with sane defaults, such as setting
     * logger and 'thisArg'
     *
     * @param {Object}  func                    - Function to try
     * @param {Array}   args                    - Arguments to pass to function
     * @param {Object}  [options]               - Function options
     * @param {Integer} [options.maxRetries]    - Number of times to retry on failure
     * @param {Integer} [options.retryInterval] - Milliseconds between retries
     * @param {Object}  [options.thisArg]       - 'this' arg to use
     * @param {Object}  [options.logger]        - logger to use
     *
     * @returns {Promise} A promise which will be resolved once function resolves
     */
    _retrier(func, args, options) {
        options = options || {};

        return utils.retrier(func, args, {
            maxRetries: options.maxRetries || this.maxRetries,
            retryInterval: options.retryInterval || this.retryInterval,
            thisArg: options.thisArg || this,
            logger: options.logger || this.logger
        })
            .catch(err => Promise.reject(err));
    }
}

module.exports = {
    AbstractCloud
};
