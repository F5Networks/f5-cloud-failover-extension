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

const ipaddr = require('ipaddr.js');
const url = require('url');
const querystring = require('querystring');
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;
const INSPECT_ADDRESSES_AND_ROUTES = require('../../constants').INSPECT_ADDRESSES_AND_ROUTES;
const GCP_FWD_RULE_PAIR_LABEL = require('../../constants').GCP_FWD_RULE_PAIR_LABEL;
const storageContainerName = require('../../constants').STORAGE_FOLDER_NAME;
const GCP_LABEL_NAME = require('../../constants').GCP_LABEL_NAME;
const util = require('../../util.js');

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

const gcpLabelRegex = new RegExp(`${GCP_LABEL_NAME}=.*\\{.*\\}`, 'g');
const gcpLabelParse = (data) => {
    let ret = {};
    try {
        ret = JSON.parse(data.match(gcpLabelRegex)[0].split('=')[1]);
    } catch (err) {
        // continue
    }
    return ret;
};
// The default operation timeout is two minutes
const NETWORK_MAX_RETRIES = 24;
const NETWORK_RETRY_INTERVAL = 5000;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.GCP, options);
        this.BASE_URL = 'https://www.googleapis.com';
        this.STORAGE_URL = 'https://storage.googleapis.com';
        this.bucket = null;
        this.proxyOptions = null;
    }

    /**
    * See the parent class method for details
    */
    init(options) {
        super.init(options);

        return Promise.all([
            this._getLocalMetadata('project/project-id'),
            this._getLocalMetadata('instance/service-accounts/default/token'),
            this._getLocalMetadata('instance/name'),
            this._getLocalMetadata('instance/zone')
        ])
            .then((data) => {
                this.projectId = data[0];
                this.customerId = data[0];
                this.accessToken = data[1].access_token;
                this.instanceName = data[2];
                this.instanceZone = data[3];
                if (this.proxySettings) {
                    const opts = url.parse(this._formatProxyUrl(this.proxySettings));
                    this.proxyOptions = {
                        protocol: opts.protocol,
                        host: opts.hostname,
                        port: opts.port
                    };
                    if (opts.username && opts.password) {
                        this.proxyOptions.auth = {};
                        this.proxyOptions.auth.username = opts.username;
                        this.proxyOptions.auth.password = opts.password;
                    }
                }
                return this._getCloudStorage(this.storageTags);
            })
            .then((data) => {
                this.bucket = data;
                this.logger.silly(`deployment bucket name: ${this.bucket}`);

                this.zone = this._parseZone(this.instanceZone);
                this.region = this.zone.substring(0, this.zone.lastIndexOf('-'));

                this.logger.silly('Getting GCP resources');
                return Promise.all([
                    this._getVmsByTags(this.addressTags),
                    this._getFwdRules({ tags: this.addressTagsRequired === true ? this.addressTags : null }),
                    this._getTargetInstances()
                ]);
            })
            .then((vmsData) => {
                this.vms = vmsData[0] || [];
                this.fwdRules = vmsData[1] || [];
                this.targetInstances = vmsData[2] || [];
                this.logger.debug('Cloud provider found vms:', this.vms);
                this.logger.debug('Cloud provider found fwdRules:', this.fwdRules);
                this.logger.debug('Cloud provider found targetInstances:', this.targetInstances);
                this.logger.silly('Cloud Provider initialization complete');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Returns region name (cloud)
     *
     *
     * @returns {Promise}
     */
    getRegion() {
        return this.region;
    }

    /**
     * Upload data to storage (cloud)
     *
     * @param {Object} fileName - file name where data should be uploaded
     * @param {Object} data     - data to upload
     *
     * @returns {Promise}
     */
    uploadDataToStorage(fileName, data) {
        this.logger.silly(`Data will be uploaded to ${fileName}: `, data);

        const stateFileObject = encodeURIComponent(`${storageContainerName}/${fileName}`);
        return new Promise((resolve, reject) => this._sendRequest('POST', `${this.STORAGE_URL}/upload/storage/v1/b/${this.bucket}/o?uploadType=media&name=${stateFileObject}`, { body: data })
            .then(() => resolve())
            .catch((err) => reject(err)));
    }

    /**
     * Download data from storage (cloud)
     *
     * @param {Object} fileName - file name where data should be downloaded
     *
     * @returns {Promise}
     */
    downloadDataFromStorage(fileName) {
        this.logger.silly(`Data will be downloaded from ${fileName}`);

        const stateFileObject = encodeURIComponent(`${storageContainerName}/${fileName}`);
        return new Promise((resolve, reject) => this._sendRequest('GET', `${this.STORAGE_URL}/storage/v1/b/${this.bucket}/o/${stateFileObject}?alt=media`, { advancedReturn: true, continueOnError: true })
            .then((response) => {
                this.logger.silly(`downloadDataFromStorage found response code ${response.code}`);
                // return success if we haven't created the file yet
                if (response.code === 404) {
                    this.logger.silly('downloadDataFromStorage could not find state file, continuing...');
                    resolve({});
                } else {
                    resolve(response.body);
                }
            })
            .catch((err) => {
                this.logger.silly(`downloadDataFromStorage received error ${err.toString()}`);
                const message = `Error in downloadDataFromStorage ${err}`;
                reject(new Error(message));
            }));
    }

    /**
    * Update Addresses
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
    * @param {Object} [options.forwardingRuleNames] - object containing forwarding rule names
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Object}
    */
    updateAddresses(options) {
        options = options || {};
        const failoverAddresses = options.failoverAddresses || [];
        const updateOperations = options.updateOperations;
        const discoverOperations = options.forwardingRules || [];
        this.logger.silly('updateAddresses(options): ', options);

        // update this.vms property prior to discovery/update
        return this._getVmsByTags(this.addressTags)
            .then((vms) => {
                this.vms = vms || [];
                // update only logic
                if (updateOperations) {
                    return this._updateAddresses(updateOperations);
                }
                // default - discover and update
                return this._discoverAddressOperations(failoverAddresses, discoverOperations);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Discover Addresses - discovers addresses
     *
     * @param {Object} options                     - function options
     * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
     * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
     *
     * @returns {Object}
     */
    discoverAddresses(options) {
        options = options || {};
        const discoverOperations = options.forwardingRules || [];
        const failoverAddresses = options.failoverAddresses || [];
        this.logger.silly('discoverAddresses: ', options);
        // update this.vms property prior to discovery/update
        return this._getVmsByTags(this.addressTags)
            .then((vms) => {
                this.vms = vms || [];
                return this._discoverAddressOperations(failoverAddresses, discoverOperations);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Discover addresses using provided definitions
     *
     * @param {Object} addresses               - local addresses, failover addresses
     * @param {Object} addressGroupDefinitions - discover forwarding rule names and alias addresses
     * @param {Object} options                 - function options
     *
     * @returns {Object} updateActions
     */
    discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options) {
        const forwardingRuleNames = [];
        const aliasAddresses = [];
        addressGroupDefinitions.forEach((item) => {
            if (item.type === 'forwardingRule') {
                forwardingRuleNames.push(item.scopingName);
            }
            if (item.type === 'aliasAddress') {
                aliasAddresses.push(item.scopingAddress);
            }
        });
        this.forwardingRuleNames = forwardingRuleNames;
        this.logger.silly('Retrieved forwarding rule names: ', this.forwardingRuleNames);
        this.aliasAddresses = aliasAddresses;
        this.logger.silly('Retrieved alias addresses: ', this.aliasAddresses);

        if (!options.isAddressOperationsEnabled) {
            return Promise.resolve();
        }
        return this.updateAddresses({
            localAddresses: addresses.localAddresses,
            failoverAddresses: addresses.failoverAddresses,
            forwardingRules: {
                type: 'name',
                fwdRuleNames: this.forwardingRuleNames
            },
            aliasAddresses: this.aliasAddresses,
            discoverOnly: true
        });
    }

    /**
     * Send HTTP Request to GCP API (Compute)
     *
     * @param {String} method       - HTTP method for the request
     * @param {String} requestUrl   - Full URL for the request
     * @param {Object} options      - Options to pass to the request
     *
     * @returns {Promise} A promise which will be resolved upon complete response
     *
     */
    _sendRequest(method, requestUrl, options) {
        if (!this.accessToken) {
            return Promise.reject(new Error('_sendRequest: no auth token. call init first'));
        }

        const parsedUrl = url.parse(requestUrl);
        const host = parsedUrl.hostname;
        const uri = parsedUrl.pathname;
        const queryString = parsedUrl.query || null;

        options.headers = {
            Authorization: `Bearer ${this.accessToken}`
        };
        options.method = method;
        options.queryParams = queryString ? querystring.parse(queryString) : {};
        options.body = options.body || '';
        options.advancedReturn = options.advancedReturn || false;
        options.continueOnError = options.continueOnError || false;
        options.validateStatus = options.validateStatus || false;
        options.proxy = this.proxyOptions;

        return this._retrier(util.makeRequest, [host, uri, options])
            .then((data) => Promise.resolve(data))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get status of operation
     *
     * @returns {Promise} A promise which will be resolved when operation status is 'DONE'
     *
     */
    _checkOperationStatus(operationLink) {
        return this._sendRequest('GET', operationLink, {})
            .then((response) => {
                this.logger.silly('_checkOperationStatus found that operation status of', response.targetLink, 'is', response.status);
                if (response.status === 'DONE') {
                    return Promise.resolve();
                }
                return Promise.reject(new Error(`Resource ${response.targetLink} is not ready yet`));
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get local metadata for a specific entry
     *
     * @param {String} entry - The name of the metadata entry. For example 'instance/zone'
     *
     * @returns {Promise} A promise which is resolved with the metadata requested
     *
     */
    _getLocalMetadata(entry) {
        const headers = {
            'Metadata-Flavor': 'Google'
        };
        const host = 'metadata.google.internal';
        const uri = `/computeMetadata/v1/${entry}`;
        return util.makeRequest(host, uri, { headers, port: 80, protocol: 'http' })
            .then((data) => Promise.resolve(data))
            .catch((err) => {
                const message = `Error in _getLocalMetadata ${JSON.stringify(err)}`;
                return Promise.reject(new Error(message));
            });
    }

    /**
     * Get Google cloud storage bucket from storageTags or storageName
     *
     * Note: do not log all bucket information, it can be very large
     *
     * @param {Object} labels - The label name of a bucket. For example { f5_cloud_failover_label: 'x' }
     *
     * @returns {Promise} A promise which is resolved with the bucket requested
     *
     */
    _getCloudStorage(labels) {
        if (this.storageName) {
            return Promise.resolve(this.storageName);
        }

        return this._sendRequest('GET', `${this.STORAGE_URL}/storage/v1/b?project=${this.projectId}`, {})
            .then((buckets) => {
                const labelKeys = Object.keys(labels);
                const filteredBuckets = buckets.items.filter((bucket) => {
                    this.logger.silly(
                        `bucket name: ${util.stringify(bucket.name)}`
                    );
                    let matchedTags = 0;
                    labelKeys.forEach((labelKey) => {
                        if (bucket.labels) {
                            Array(bucket.labels).forEach((bucketLabel) => {
                                if (Object.keys(bucketLabel).indexOf(labelKey) !== -1
                                    && bucketLabel[labelKey] === labels[labelKey]) {
                                    matchedTags += 1;
                                }
                            });
                        }
                    });
                    return labelKeys.length === matchedTags;
                });
                if (!filteredBuckets || filteredBuckets.length === 0) {
                    return Promise.reject(new Error(`Filtered bucket does not exist: ${filteredBuckets}`));
                }
                return Promise.resolve(filteredBuckets[0].name); // there should only be one
            });
    }

    /**
     * Get instance metadata from GCP
     *
     * @param {Object} vmName         - instance name
     *
     * @param {Object} options        - function options
     * @param {String} [options.zone] - instance zone
     *
     * @returns {Promise} A promise which will be resolved with the metadata for the instance
     *
     */
    _getVmMetadata(vmName, options) {
        options = options || {};
        const zone = options.zone || this.zone;

        return this._sendRequest('GET', `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones/${zone}/instances/${vmName}`, {})
            .then((metadata) => Promise.resolve(metadata))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get Instance Information from VM metadata
     *
     * @param {Object} vmName                     - Instance Name
     *
     * @param {Object} options                    - Options for function
     * @param {Array} [options.failOnStatusCodes] - Optionally provide a list of status codes to fail
     *                                              on, for example 'STOPPING'
     * @param {String} [options.zone]             - instance zone
     *
     * @returns {Promise} A promise which will be resolved with the metadata for the instance
     *
     */
    _getVmInfo(vmName, options) {
        options = options || {};
        const failOnStatusCodes = options.failOnStatusCodes || [];
        const zone = options.zone || this.zone;

        return this._getVmMetadata(vmName, { zone })
            .then((data) => {
                if (failOnStatusCodes.length > 0) {
                    const vmStatus = data.status;
                    if (vmStatus && vmStatus.includes(failOnStatusCodes)) {
                        return Promise.reject(new Error('VM status is in failOnStatusCodes'));
                    }
                }
                return Promise.resolve(data);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get all VMs with a given tags (labels)
     *
     * @param {Object} tags - Tags to search for. Tags should be in the format:
     *
     *
     *                 {
     *                     key01: value01,
     *                     key02: value02
     *                 }
     *
     * @returns {Promise} A promise which will be resolved with an array of instances
     *
     */
    _getVmsByTags(tags) {
        if (!tags) {
            return Promise.reject(new Error('getVmsByTags: no tag, load configuration file first'));
        }
        const options = {};
        options.filter = [];

        Object.keys(tags).forEach((tagKey) => {
            // Labels in GCP must be lower case
            options.filter.push(`labels.${tagKey.toLowerCase()} eq ${tags[tagKey].toLowerCase()}`);
        });
        const uri = `${this.BASE_URL}/compute/v1/projects/${this.projectId}/aggregated/instances?filter=${options.filter}`;
        return this._sendRequest('GET', uri, {})
            .then((vmsData) => {
                const arrayItems = vmsData.items;
                const instance = [];
                let i = 0;
                Object.entries(arrayItems).forEach((entry) => {
                    const [key, value] = entry;
                    if (value.instances !== undefined && i === 0) {
                        this.logger.silly('Found instance in', key);
                        instance.push(value.instances);
                        i = 1;
                    } else if (value.instances !== undefined && i === 1) {
                        this.logger.silly('Found instance in', key);
                        instance[0].push(value.instances[0]);
                    }
                });
                const computeVms = (instance !== undefined && Object.keys(instance).length > 0) ? instance : [[]];
                const promises = [];
                computeVms[0].forEach((vm) => {
                    promises.push(this._retrier(
                        this._getVmInfo,
                        [vm.name, { zone: this._parseZone(vm.zone), failOnStatusCodes: ['STOPPING'] }]
                    ));
                });
                return Promise.all(promises);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get all forwarding rules (non-global)
     *
     * @param {Object} options  - function options
     * @param {Object} tags     - 1+ tags to filter on
     *                 {
     *                     key01: value01,
     *                     key02: value02
     *                 }
     *
     * @returns {Promise} A promise which will be resolved with an array of forwarding rules
     *
     */
    _getFwdRules(options) {
        options = options || {};

        return this._getItemsUsingNextPageToken(`regions/${this.region}/forwardingRules`, [], '')
            .then((fwdRules) => {
                // optionally filter fwd rules using tags
                if (options.tags) {
                    const filteredFwdRules = fwdRules.filter((fwdRule) => {
                        const fwdRuleTags = gcpLabelParse(fwdRule.description || '');

                        let matchedTags = 0;
                        Object.keys(options.tags).forEach((tagKey) => {
                            if (fwdRuleTags && Object.keys(fwdRuleTags).indexOf(tagKey) !== -1
                                && fwdRuleTags[tagKey] === options.tags[tagKey]) {
                                matchedTags += 1;
                            }
                        });
                        return Object.keys(options.tags).length === matchedTags;
                    });
                    return Promise.resolve(filteredFwdRules);
                }
                return Promise.resolve(fwdRules);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get all target instances
     *
     * @returns {Promise} A promise which will be resolved with an array of target instances
     *
     */
    _getTargetInstances() {
        return this._getItemsUsingNextPageToken(`zones/${this.zone}/targetInstances`, [], '')
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get items (cloud resources) using nextPageToken
     *
     * @returns {Promise} A promise which will be resolved with an array of items/resources
     *
     */
    _getItemsUsingNextPageToken(path, list, nextPageToken) {
        if (nextPageToken !== '') {
            if (path.slice(-1) === '/') {
                path = path.slice(0, -1);
            }
            if (path.indexOf('?pageToken') !== -1) {
                path = path.substr(0, path.indexOf('?pageToken'));
            }
            path = `${path}?pageToken=${nextPageToken}`;
        }
        return new Promise((resolve, reject) => {
            this._sendRequest('GET', `${this.BASE_URL}/compute/v1/projects/${this.projectId}/${path}`, {})
                .then((pagedRulesList) => {
                    list = list.concat(pagedRulesList.items);
                    if (pagedRulesList.nextPageToken) {
                        this.logger.silly('_getItemsUsingNextPageToken called recursively to fetch next page');
                        this._getItemsUsingNextPageToken(path, list, pagedRulesList.nextPageToken)
                            .then((rList) => {
                                resolve(rList);
                            });
                    } else {
                        resolve(list);
                    }
                })
                .catch((err) => reject(err));
        });
    }

    /**
     * Parse zone - parse zone out of a provider object
     *
     * @returns {String} The parsed zone
     *
     */
    _parseZone(zoneProperty) {
        // known zone formats
        // - 'projects/1111/zones/us-west1-a'
        // - 'https://www.googleapis.com/compute/v1/projects/1111/zones/us-west1-a'
        const parts = zoneProperty.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Collects routes (tables) from the provider
     *
     * @param {Object} options            - function options
     * @param {Array} [options.pageToken] - Optionally provide a pagination token
     *
     * @returns {Promise} A promise which will provide list of routes which need to be updated
     *
     */
    _getRouteTables(options) {
        options = options || {};

        const pageToken = options.pageToken || '';
        const routesList = [];
        return this._getItemsUsingNextPageToken('global/routes/', routesList, pageToken)
            .catch((err) => Promise.reject(err));
    }

    /**
     * Match IPs against a filter set of IPs
     *
     * @param {Object} ips - Array of IPs, support in .ipCidrRange
     *
     * @param {Object} ipsFilter - Array of filter IPs, support in .address
     *
     * @returns {Promise} A promise which will be resolved with the array of matched IPs
     *
     */
    _matchIps(ips, ipsFilter) {
        const matched = [];
        ips.forEach((ip) => {
            let match = false;

            // Each IP should contain CIDR suffix
            let ipAddr = ip && ip.ipCidrRange !== undefined ? ip.ipCidrRange : ip;
            ipAddr = ipAddr.indexOf('/') === -1 ? `${ipAddr}/32` : ipAddr;
            const ipAddrParsed = ipaddr.parse(ipAddr.split('/')[0]);
            const ipAddrParsedCidr = ipaddr.parseCIDR(ipAddr);

            ipsFilter.forEach((ipFilter) => {
                // IP in filter array within range will constitute match
                let ipFilterAddr = ipFilter.address !== undefined ? ipFilter.address : ipFilter;
                ipFilterAddr = ipFilterAddr.split('/')[0];
                const ipFilterAddrParsed = ipaddr.parse(ipFilterAddr);
                if (ipAddrParsed.kind() === ipFilterAddrParsed.kind() && ipFilterAddrParsed.match(ipAddrParsedCidr)) {
                    match = true;
                }
            });
            // Add IP to matched array if a match was found
            if (match) {
                matched.push(ip);
            }
        });
        return matched;
    }

    /**
     * Match forwarding rules
     *
     * @param {Object} ruleNames - Array of forwarding rule names
     *
     * @param {Object} forwardingRulesNames - Array of filter forwarding rule names
     *
     * @returns {Promise} A promise which will be resolved with the array of matched forwarding rule names
     *
     */
    _matchFwdRuleNames(ruleNames, forwardingRuleNames) {
        const matched = [];
        ruleNames.forEach((ruleName) => {
            let match = false;
            forwardingRuleNames.forEach((forwardingRuleName) => {
                if (ruleName.match(forwardingRuleName)) {
                    match = true;
                }
            });
            // Add rule to matched array if a match was found
            if (match) {
                matched.push(ruleName);
            }
        });
        return matched;
    }

    /**
     * Get the addresses and routes for inspect endpoint
     *
     * @param {Boolean} isAddressOperationsEnabled   - Are we inspecting addresses
     * @param {Boolean} isRouteOperationsEnabled     - Are we inspecting routes
     *
     * @returns {Promise} A promise which will be resolved with the array of Big-IP addresses and routes
     */
    getAssociatedAddressAndRouteInfo(isAddressOperationsEnabled, isRouteOperationsEnabled) {
        const data = util.deepCopy(INSPECT_ADDRESSES_AND_ROUTES);
        data.instance = this.instanceName;
        const privateIps = [];
        return this._getVmsByTags(this.addressTags)
            .then((vms) => {
                vms.forEach((vm) => {
                    vm.networkInterfaces.forEach((address) => {
                        if (vm.name === this.instanceName) {
                            if (isAddressOperationsEnabled) {
                                let vmPublicIp = null;
                                if (address.accessConfigs) {
                                    vmPublicIp = address.accessConfigs[0].natIP;
                                }
                                data.addresses.push({
                                    publicIpAddress: vmPublicIp,
                                    privateIpAddress: address.networkIP,
                                    networkInterfaceId: address.name
                                });
                            }
                            privateIps.push(address.networkIP);
                        }
                    });
                });
                return isRouteOperationsEnabled ? this._getRouteTables() : [];
            })
            .then((routeTables) => {
                this.routeGroupDefinitions.forEach((routeGroup) => {
                    const filteredRouteTables = this._filterRouteTables(
                        routeTables.map((routeTable) => Object.assign(
                            routeTable,
                            { parsedTags: gcpLabelParse(routeTable.description || '') }
                        )),
                        {
                            name: routeGroup.routeName,
                            tags: routeGroup.routeTags
                        }
                    );
                    filteredRouteTables.forEach((route) => {
                        if (privateIps.includes(route.nextHopIp)) {
                            data.routes.push({
                                routeTableId: route.id,
                                routeTableName: route.name,
                                networkId: route.network
                            });
                        }
                    });
                });
                return Promise.resolve(data);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Discover address operations
     *
     * @param {Object} failoverAddresses - failover addresses
     * @param {Object} discoverOperations - discover forwarding rules operations
     *
     * @returns {Promise} { publicAddresses: [], interfaces: [], loadBalancerAddresses: [] }
     *
     */
    _discoverAddressOperations(failoverAddresses, discoverOperations) {
        this.logger.debug('Failover addresses to discover', failoverAddresses);
        if (!failoverAddresses || !failoverAddresses.length) {
            this.logger.debug('No failoverAddresses to discover');
            return Promise.resolve({
                publicAddresses: [],
                interfaces: {
                    disassociate: [],
                    associate: []
                },
                loadBalancerAddresses: []
            });
        }

        return Promise.all([
            this._discoverNicOperations(failoverAddresses),
            this._discoverFwdRuleOperations(discoverOperations)
        ])
            .then((operations) => Promise.resolve({
                publicAddresses: {},
                interfaces: operations[0],
                loadBalancerAddresses: operations[1]
            }))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Discover nic (alias ip, etc.) operations
     *
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Promise} A promise which will be resolved once update is complete
     *
     */
    _discoverNicOperations(failoverAddresses) {
        const myVms = [];
        const theirVms = [];
        const aliasIpsArr = [];
        const disassociate = [];
        const associate = [];

        // There should be at least one item in trafficGroupIpArr
        if (!failoverAddresses || !failoverAddresses.length) {
            this.logger.silly('No traffic group address(es) exist, skipping');
            return Promise.resolve({ disassociate, associate });
        }

        // Look through each VM and separate us vs. them
        this.vms.forEach((vm) => {
            if (vm.name === this.instanceName) {
                myVms.push(vm);
            } else {
                theirVms.push(vm);
            }
        });

        // There should be one item in myVms
        if (!myVms.length) {
            const message = `Unable to locate our VM in the deployment: ${this.instanceName}`;
            this.logger.error(message);
            return Promise.reject(new Error(message));
        }

        theirVms.forEach((vm) => {
            this.logger.silly(`VM name: ${vm.name}`);
            vm.networkInterfaces.forEach((nic) => {
                const theirNic = nic;
                const theirAliasIps = theirNic.aliasIpRanges;
                if (theirAliasIps && theirAliasIps.length) {
                    const matchingAliasIps = this._matchIps(theirAliasIps, failoverAddresses);
                    if (matchingAliasIps.length) {
                        // Track all alias IPs found for inclusion
                        aliasIpsArr.push({
                            vmName: vm.name,
                            nicName: nic.name,
                            aliasIpRanges: matchingAliasIps
                        });

                        // Yank alias IPs from their VM NIC properties, mark NIC for update
                        matchingAliasIps.forEach((myIp) => {
                            let i = 0;
                            theirAliasIps.forEach((theirIp) => {
                                if (myIp.ipCidrRange === theirIp.ipCidrRange) {
                                    theirAliasIps.splice(i, 1);
                                }
                                i += 1;
                            });
                        });

                        disassociate.push([
                            vm.name,
                            nic.name,
                            {
                                aliasIpRanges: theirAliasIps,
                                fingerprint: theirNic.fingerprint
                            },
                            {
                                zone: this._parseZone(vm.zone)
                            }
                        ]);
                    }
                }
            });
        });

        // Look through alias IP array and add to active VM's matching NIC
        const myVm = [myVms[0]];
        myVm.forEach((vm) => {
            vm.networkInterfaces.forEach((nic) => {
                let match = false;
                const myNic = nic;
                myNic.aliasIpRanges = myNic.aliasIpRanges !== undefined ? myNic.aliasIpRanges : [];
                aliasIpsArr.forEach((ip) => {
                    if (nic.name === ip.nicName) {
                        match = true;
                        ip.aliasIpRanges.forEach((alias) => {
                            myNic.aliasIpRanges.push(alias);
                        });
                    }
                });
                if (match) {
                    associate.push([
                        vm.name,
                        myNic.name,
                        {
                            aliasIpRanges: myNic.aliasIpRanges,
                            fingerprint: myNic.fingerprint
                        },
                        {
                            zone: this._parseZone(vm.zone)
                        }
                    ]);
                }
            });
        });
        return Promise.resolve({ disassociate, associate });
    }

    /**
     * Discover what forwarding rules to update by IPAddresses or forwarding rule names
     *
     * @param {Object} discoverOperations - discover operations
     *
     * @returns {Promise} A promise which will be resolved once discovery is complete
     *
     */
    _discoverFwdRuleOperations(discoverOperations) {
        const fwdRulesToUpdate = [];
        this.logger.silly('discoverOperations:', discoverOperations);
        const getOurTargetInstance = (instanceName, tgtInstances) => {
            const result = [];

            tgtInstances.forEach((tgt) => {
                const tgtInstance = tgt.instance.split('/');
                const tgtInstanceName = tgtInstance[tgtInstance.length - 1];
                // check for instance name in .instance where it is an exact match
                if (tgtInstanceName === instanceName) {
                    result.push({ name: tgt.name, selfLink: tgt.selfLink });
                }
            });

            if (!result.length) {
                throw new Error(`Unable to locate our target instance: ${this.instanceName}`);
            }
            return result[0];
        };

        return Promise.all([
            this._getFwdRules({ tags: this.addressTagsRequired === true ? this.addressTags : null }),
            this._getTargetInstances()
        ])
            .then((data) => {
                this.fwdRules = data[0] || [];
                this.targetInstances = data[1] || [];
                this.fwdRules.forEach((rule) => {
                    let match = [];

                    if (discoverOperations.type === 'address' && rule !== undefined && rule.IPAddress) {
                        match = this._matchIps([rule.IPAddress], discoverOperations.ipAddresses);
                    } else if (discoverOperations.type === 'name' && rule !== undefined && rule.name) {
                        match = this._matchFwdRuleNames([rule.name], discoverOperations.fwdRuleNames);
                    }
                    if (!match.length) {
                        return; // continue with next iteration
                    }

                    this.logger.silly('updateFwdRules matched rule:', rule);

                    let targetInstanceToUse = getOurTargetInstance(this.instanceName, this.targetInstances);
                    // the target instance to use may also be provided on the fwd rules object
                    // itself, check there if necessary
                    const fwdRuleDefinedTargetInstances = this._getFwdRulesTargetInstancesFromLabel(rule);
                    if (fwdRuleDefinedTargetInstances) {
                        targetInstanceToUse = getOurTargetInstance(
                            this.instanceName, fwdRuleDefinedTargetInstances
                        );
                    }
                    if (targetInstanceToUse === undefined || targetInstanceToUse === '') {
                        this.logger.warning('Target instance to use is undefined');
                    }
                    this.logger.silly('Discovered our target instance ', targetInstanceToUse);

                    if (rule.target && rule.target.indexOf(targetInstanceToUse.name) === -1) {
                        fwdRulesToUpdate.push([rule.name, targetInstanceToUse.selfLink]);
                    }
                });
                this.logger.silly('fwdRulesToUpdate: ', fwdRulesToUpdate);

                return Promise.resolve({ operations: fwdRulesToUpdate });
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Discover route operations
    *
    * @param {Object} localAddresses - local addresses
    *
    * @returns {Promise} { operations: [] }
    */
    _discoverRouteOperationsPerGroup(localAddresses, routeGroup, routeTables) {
        const operations = [];
        const filteredRouteTables = this._filterRouteTables(
            routeTables.map((routeTable) => Object.assign(
                routeTable,
                { parsedTags: gcpLabelParse(routeTable.description) }
            )),
            {
                name: routeGroup.routeName,
                tags: routeGroup.routeTags
            }
        );

        // route table object "is" the route, there are no child route objects
        filteredRouteTables.forEach((route) => {
            const matchedAddressRange = this._matchRouteToAddressRange(
                route.destRange,
                routeGroup.routeAddressRanges
            );
            if (matchedAddressRange) {
                const nextHopAddress = this._discoverNextHopAddress(
                    localAddresses,
                    gcpLabelParse(route.description),
                    matchedAddressRange.routeNextHopAddresses
                );
                if (nextHopAddress && route.nextHopIp !== nextHopAddress) {
                    this.logger.silly('Route to be updated: ', route);
                    route.nextHopIp = nextHopAddress;
                    operations.push(route);
                }
            }
        });
        return Promise.resolve(operations);
    }

    /**
    * Update addresses (given NIC and/or fwdRule operations)
    *
    * @param {Object} options            - function options
    * @param {Object} [options.interfaces]     - interfaces for nic operations
    * @param {Object} [options.loadBalancerAddresses] - load balancer addresses for forwarding rule operations
    *
    * @returns {Promise}
    */
    _updateAddresses(options) {
        options = options || {};
        const nicOperations = options.interfaces || {};
        const fwdRuleOperations = options.loadBalancerAddresses || {};

        if (!options || Object.keys(options).length === 0) {
            this.logger.info('No address operations to run');
            return Promise.resolve();
        }
        this.logger.silly('_updateAddresses interface operations: ', nicOperations);
        this.logger.silly('_updateAddresses forwarding rules operations: ', fwdRuleOperations);
        return Promise.all([
            this._updateNics(nicOperations.disassociate, nicOperations.associate),
            this._updateFwdRules(fwdRuleOperations.operations)
        ])
            .catch((err) => Promise.reject(err));
    }

    /**
    * Update nics (given disassociate/associate operations)
    *
    * @param {Array} disassociate - Disassociate array
    * @param {Array} associate    - Associate array
    *
    * @returns {Promise}
    */
    _updateNics(disassociate, associate) {
        this.logger.silly('updateAddresses disassociate operations: ', disassociate);
        this.logger.silly('updateAddresses associate operations: ', associate);
        if (!disassociate || !associate) {
            this.logger.info('No associations to update.');
            return Promise.resolve([]);
        }
        const disassociatePromises = [];
        disassociate.forEach((item) => {
            disassociatePromises.push(this._retrier(this._updateNic, item));
        });
        return Promise.all(disassociatePromises)
            .then((disassociateTasks) => {
                const disassociateStatusPromises = [];
                disassociateTasks.forEach((task) => {
                    disassociateStatusPromises.push(this._retrier(this._checkOperationStatus, [task], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });
                return Promise.all(disassociateStatusPromises);
            })
            .then(() => {
                this.logger.info('Disassociate NIC tasks successful.');
                const associatePromises = [];
                associate.forEach((item) => {
                    associatePromises.push(this._retrier(this._updateNic, item));
                });
                return Promise.all(associatePromises);
            })
            .then((associateTasks) => {
                const associateStatusPromises = [];
                associateTasks.forEach((task) => {
                    associateStatusPromises.push(this._retrier(this._checkOperationStatus, [task], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });
                return Promise.all(associateStatusPromises);
            })
            .then(() => {
                this.logger.info('Associate NICs successful.');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Update forwarding rules (given reassociate operations)
     *
     * @param {Array} operations - operations array
     *
     * @returns {Promise} A promise which will be resolved once update is complete
     *
     */
    _updateFwdRules(operations) {
        const promises = [];
        // check if operations is undefined
        if (operations === undefined || operations.length === 0) {
            return Promise.resolve([]);
        }
        operations.forEach((item) => {
            promises.push(this._retrier(this._updateFwdRule, item));
        });
        return Promise.all(promises)
            .then((updateFwdRuleTasks) => {
                const statusPromises = [];
                updateFwdRuleTasks.forEach((task) => {
                    statusPromises.push(this._retrier(this._checkOperationStatus, [task], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });
                return Promise.all(statusPromises);
            })
            .then(() => {
                this.logger.info('Updated forwarding rules successfully');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Update routes (given reassociate operations)
    *
    * @param {Array} operations - operations array
    *
    * @returns {Promise}
    */
    _updateRoutes(operations) {
        this.logger.debug('updateRoutes operations: ', operations);
        if (!operations || !operations.length) {
            this.logger.info('No route operations to run');
            return Promise.resolve();
        }
        // update routes is not supported in GCP, so delete and recreate
        const deletePromises = [];
        operations.forEach((item) => {
            deletePromises.push(this._retrier(this._deleteRoute, [item]));
        });
        return Promise.all(deletePromises)
            .then((deleteRouteTasks) => {
                const deleteRoutesStatusPromises = [];
                deleteRouteTasks.forEach((task) => {
                    deleteRoutesStatusPromises.push(this._retrier(this._checkOperationStatus, [task], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });
                return Promise.all(deleteRoutesStatusPromises);
            })
            .then(() => {
                const createPromises = [];
                operations.forEach((item) => {
                    createPromises.push(this._retrier(this._createRoute, [item]));
                });
                return Promise.all(createPromises);
            })
            .then((createRouteTasks) => {
                const createRoutesStatusPromises = [];
                createRouteTasks.forEach((task) => {
                    createRoutesStatusPromises.push(this._retrier(this._checkOperationStatus, [task], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });
                return Promise.all(createRoutesStatusPromises);
            })
            .then(() => {
                this.logger.info('Updated routes successfully');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Updates Instance Network Interface
     *
     * @param {Object} vmId           - Instance ID
     * @param {Object} nicId          - NIC ID (name)
     * @param {Object} nicArr         - Updated NIC properties
     *
     * @param {Object} options        - function options
     * @param {Object} [options.zone] - override default zone
     *
     * @returns {Promise} A promise which will be resolved with the operation response
     *
     */
    _updateNic(vmId, nicId, nicArr, options) {
        options = options || {};
        const zone = options.zone || this.zone;

        this.logger.silly(`Updating NIC: ${nicId} for VM ${vmId} in zone ${zone}`);
        return this._sendRequest(
            'PATCH',
            `${this.BASE_URL}/compute/v1/projects/${this.projectId}/zones/${zone}/instances/${vmId}/updateNetworkInterface?networkInterface=${nicId}`,
            {
                body: nicArr
            }
        )
            .then((response) => Promise.resolve(response.selfLink))
            .catch((err) => {
                this.logger.silly(`Update NIC status: ${err}`);
                // workaround for quota exceeded, retries API call response conditionNotMet during updateNic
                if (err.message && err.message.indexOf('conditionNotMet') !== -1) {
                    return Promise.resolve();
                }
                return Promise.reject(err);
            });
    }

    /**
     * Updates forwarding rule target
     *
     * @param {Object} name - Fowarding rule name
     *
     * @param {Object} target - Fowarding rule target instance to set
     *
     * @returns {Promise} A promise which will be resolved with the operation response
     *
     */
    _updateFwdRule(name, target) {
        this.logger.silly(`Updating forwarding rule: ${name} to target: ${target}`);
        const targetBody = JSON.parse(`{ "target": "${target}" }`);
        const uri = `${this.BASE_URL}/compute/v1/projects/${this.projectId}/regions/${this.region}/forwardingRules/${name}/setTarget`;
        return this._sendRequest('POST', uri, { body: targetBody })
            .then((response) => {
                const operationName = response.name;
                this.logger.silly(`updateFwdRule operation name: ${operationName}`);
                return Promise.resolve(response.selfLink);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Finds target pair label on forwarding rule and returns the target
     * instances that match the target pair names
     *
     * @param rule               - Forwarding rule
     * @return {null|Array}      - Array of target instances
     * @private
     */
    _getFwdRulesTargetInstancesFromLabel(rule) {
        const targetInstanceNames = gcpLabelParse(rule.description)[GCP_FWD_RULE_PAIR_LABEL];
        if (targetInstanceNames) {
            return this.targetInstances.filter(
                (targetInstance) => targetInstanceNames.split(/[ ,]+/).indexOf(targetInstance.name) !== -1
            );
        }
        return null;
    }

    /**
    * Delete specified GCP user defined routes
    *
    * @param {Array} item - item array
    *
    * @returns {Promise} A promise which will be resolved with the operation response
    */
    _deleteRoute(item) {
        const path = `global/routes/${item.id}`;
        return this._sendRequest('DELETE', `${this.BASE_URL}/compute/v1/projects/${this.projectId}/${path}`, {})
            .then((response) => Promise.resolve(response.selfLink))
            .catch((err) => {
                this.logger.silly(`Delete route status: ${err}`);
                // workaround for quota exceeded, retries API call response notFound during delete route
                if (err.message && err.message.indexOf('notFound') !== -1) {
                    return Promise.resolve();
                }
                return Promise.reject(err);
            });
    }

    /**
    * Create specified GCP user defined routes
    *
    * @param {Array} item - item array
    *
    * @returns {Promise} A promise which will be resolved with the operation response
    */
    _createRoute(item) {
        // delete necessary properties first
        delete item.id;
        delete item.creationTimestamp;
        delete item.kind;
        delete item.selfLink;
        return this._sendRequest('POST', `${this.BASE_URL}/compute/v1/projects/${this.projectId}/global/routes/`, { body: item })
            .then((response) => Promise.resolve(response.selfLink))
            .catch((err) => {
                this.logger.silly(`Create route status: ${err}`);
                // workaround for quota exceeded, retries API call response route alreadyExists during create route
                if (err.message && err.message.indexOf('alreadyExists') !== -1) {
                    return Promise.resolve();
                }
                return Promise.reject(err);
            });
    }
}

module.exports = {
    Cloud
};
