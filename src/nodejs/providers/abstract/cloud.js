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

        const logger = options && options.logger ? options.logger : Logger;
        if (logger) {
            this.logger = logger;
        }
    }

    /**
    * Initialize the Cloud Provider
    *
    * @param {Object} options                         - function options
    * @param {Object} [options.addressTags]           - tags to filter addresses on
    * @param {Boolean} [options.addressTagsRequired]  - denote if address tags are required for all objects
    *                                                   (such as GCP forwarding rules)
    * @param {Object} [options.proxySettings]         - proxy settings { protocol: '', 'host': '', port: ''  }
    * @param {Object} [options.routeGroupDefinitions] - group definitions to filter routes on
    * @param {Object} [options.routeAddressRanges]    - addresses to filter on [{ 'range': '192.0.2.0/24' }]
    *                                                   with next hop address discovery configuration:
    *                                                     { 'type': 'address': 'items': [], tag: null}
    * @param {Object} [options.storageTags]           - storage tags to filter on { 'key': 'value' }
    * @param {Object} [options.storageName]           - storage scoping name
    * @param {Object} [options.subnets]               - subnets
    * @param {Object} [options.trustedCertBundle]     - custom certificate bundle for cloud API calls
    */
    init(options) {
        options = options || {};
        this.addressTags = options.addressTags || {};
        this.addressTagsRequired = options.addressTagsRequired || false;
        this.proxySettings = options.proxySettings || null;
        this.routeGroupDefinitions = options.routeGroupDefinitions || {};
        this.storageTags = options.storageTags || {};
        this.storageName = options.storageName || '';
        this.subnets = options.subnets || {};
        this.trustedCertBundle = options.trustedCertBundle || '';
    }

    downloadDataFromStorage() {
        throw new Error('Method must be implemented in child class!');
    }

    getAssociatedAddressAndRouteInfo() {
        throw new Error('Method must be implemented in child class!');
    }

    updateAddresses() {
        throw new Error('Method must be implemented in child class!');
    }

    discoverAddresses() {
        throw new Error('Method must be implemented in child class!');
    }

    discoverAddressOperationsUsingDefinitions() {
        throw new Error('Method must be implemented in child class!');
    }

    uploadDataToStorage() {
        throw new Error('Method must be implemented in child class!');
    }

    /**
    * Update routes
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing 1+ local (self) addresses [ '192.0.2.1' ]
    * @param {Boolean} [options.discoverOnly]     - only perform discovery operation
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Promise}
    */
    updateRoutes(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const discoverOnly = options.discoverOnly || false;
        const updateOperations = options.updateOperations;

        this.logger.silly('updateRoutes: ', options);

        if (discoverOnly === true) {
            return this._discoverRouteOperations(localAddresses)
                .catch((err) => Promise.reject(err));
        }
        if (updateOperations) {
            return this._updateRoutes(updateOperations.operations)
                .catch((err) => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverRouteOperations(localAddresses)
            .then((operations) => this._updateRoutes(operations.operations))
            .catch((err) => Promise.reject(err));
    }

    _checkForNicOperations() {
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
                potentialAddresses = routeTableTags[discoveryOptions.tag].split(',').map((i) => i.trim());
            }
            break;
        default:
            throw new Error(`Invalid discovery type was provided: ${discoveryOptions.type}`);
        }

        const nextHopAddressToUse = potentialAddresses.filter((item) => localAddresses.indexOf(item) !== -1)[0];
        if (!nextHopAddressToUse) {
            this.logger.warning(`Next hop address to use is empty: ${localAddresses} ${potentialAddresses}`);
        }

        this.logger.silly(`Next hop address: ${nextHopAddressToUse}`);
        return nextHopAddressToUse;
    }

    /**
    * Discover route operations
    *
    * @param {Object} localAddresses          - local addresses
    *
    * @returns {Object} - { operations: [] }
    */
    _discoverRouteOperations(localAddresses) {
        return this._getRouteTables()
            .then((routeTables) => Promise.all(this.routeGroupDefinitions.map(
                (routeGroup) => this._discoverRouteOperationsPerGroup(
                    localAddresses,
                    routeGroup,
                    routeTables
                )
            )))
            .then((groupOperations) => {
                const operations = [];
                groupOperations.forEach((groupOperation) => {
                    groupOperation.forEach((operation) => {
                        operations.push(operation);
                    });
                });
                return Promise.resolve({ operations });
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Filter route tables
     *
     * @param {Object} routeTables        - route tables
     * @param {Object} options            - function options
     * @param {Object} [options.tags]     - object containing 1+ tags to filter on { 'key': 'value' }
     * @param {Object} [options.name]     - route name to filter on
     *
     * @returns {object} routeTables      - filtered route tables
     */
    _filterRouteTables(routeTables, options) {
        options = options || {};

        if (options.tags && Object.keys(options.tags)) {
            return routeTables.filter((item) => {
                let matchedTags = 0;
                Object.keys(options.tags).forEach((key) => {
                    const itemTags = this._normalizeTags(item.Tags || item.tags || item.parsedTags);
                    if (itemTags && Object.keys(itemTags).indexOf(key) !== -1
                        && itemTags[key] === options.tags[key]) {
                        matchedTags += 1;
                    }
                });
                return Object.keys(options.tags).length === matchedTags;
            });
        }
        if (options.name) {
            return routeTables.filter((item) => (item.name || item.RouteTableId) === options.name);
        }
        return [];
    }

    /**
     * Format proxy URL
     *
     * @param {Object} settings - proxy settings
     *
     * @returns {String} URL (valid proxy URL)
     */
    _formatProxyUrl(settings) {
        if (!settings.host) throw new Error('Host must be provided to format proxy URL');
        if (!settings.port) throw new Error('Port must be provided to format proxy URL');

        const protocol = settings.protocol || 'https';
        const auth = settings.username && settings.password
            ? `${settings.username}:${settings.password}@` : '';

        return `${protocol}://${auth}${settings.host}:${settings.port}`;
    }

    /**
     * Returns route address range and next hop addresses config info given the route's
     * destination cidr
     *
     * Note: If one of the route address entries contains 'all', it should be considered a match
     *
     * @param cidr               - Cidr to match against routeAddressRanges.routeAddresses
     * @param routeAddressRanges - route address ranges to match against
     *
     * @return {Object|null}
     */

    _matchRouteToAddressRange(cidr, routeAddressRanges) {
        // check for special 'all' case
        if (routeAddressRanges[0].routeAddresses.indexOf('all') !== -1) {
            return routeAddressRanges[0];
        }
        // simply compare this cidr to the route address ranges array and look for a match
        const matchingRouteAddressRange = routeAddressRanges.filter(
            (routeAddressRange) => routeAddressRange.routeAddresses.indexOf(cidr) !== -1
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
            .catch((err) => Promise.reject(err));
    }

    /**
     * Generate the configuration operations required to reassociate the addresses
     *
     * @param {Object} localAddresses    - local addresses
     * @param {Object} failoverAddresses - failover addresses
     * @param {Object} parsedNics        - parsed NICs information
     *
     * @returns {Promise} - A Promise that is resolved with the operations, or rejected if an error occurs
     */
    _generateAddressOperations(localAddresses, failoverAddresses, parsedNics) {
        const operations = {
            disassociate: [],
            associate: []
        };
        this.logger.debug('parsedNics', parsedNics);
        if (!parsedNics.mine || !parsedNics.theirs) {
            this.logger.error('Could not determine network interfaces.');
        } else {
            // go through 'their' nics and come up with disassociate/associate actions required
            // to move addresses to 'my' nics, if any are required
            for (let s = parsedNics.mine.length - 1; s >= 0; s -= 1) {
                for (let h = parsedNics.theirs.length - 1; h >= 0; h -= 1) {
                    const theirNic = parsedNics.theirs[h].nic;
                    const myNic = parsedNics.mine[s].nic;
                    theirNic.tags = theirNic.tags ? theirNic.tags : this._normalizeTags(theirNic.TagSet);
                    myNic.tags = myNic.tags ? myNic.tags : this._normalizeTags(myNic.TagSet);
                    if (theirNic.tags[constants.NIC_TAG] === undefined || myNic.tags[constants.NIC_TAG] === undefined) {
                        this.logger.warning(`${constants.NIC_TAG} tag values do not match or doesn't exist for a interface`);
                    } else if (theirNic.tags[constants.NIC_TAG] && myNic.tags[constants.NIC_TAG]
                        && theirNic.tags[constants.NIC_TAG] === myNic.tags[constants.NIC_TAG]) {
                        const nicOperations = this._checkForNicOperations(myNic, theirNic, failoverAddresses);

                        if (nicOperations.disassociate && nicOperations.associate) {
                            operations.disassociate.push(nicOperations.disassociate);
                            operations.associate.push(nicOperations.associate);
                        }
                    }
                }
            }
            this.logger.debug('Generated Address Operations', operations);
        }

        return Promise.resolve(operations);
    }
}

module.exports = {
    AbstractCloud
};
