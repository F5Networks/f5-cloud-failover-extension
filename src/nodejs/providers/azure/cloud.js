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

const url = require('url');
const querystring = require('querystring');
const { parse } = require('cruftless')();
const IPAddressLib = require('ip-address');
const util = require('../../util.js');
const constants = require('../../constants');

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

const CLOUD_PROVIDERS = constants.CLOUD_PROVIDERS;
const INSPECT_ADDRESSES_AND_ROUTES = require('../../constants').INSPECT_ADDRESSES_AND_ROUTES;

const storageContainerName = constants.STORAGE_FOLDER_NAME;

const NETWORK_MAX_RETRIES = 60;
const NETWORK_RETRY_INTERVAL = 1000;
const METADATA_VERSION = '2021-02-01';
const X_MS_VERSION = '2017-11-09';
const NETWORK_API_VERSION = '2023-05-01';
const STORAGE_API_VERSION = '2023-01-01';

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AZURE, options);
        this.resourceToken = null;
        this.storageToken = null;
        this.nics = null;
        this.region = null;
        this.resourceGroup = null;
        this.primarySubscriptionId = null;
        this.subscriptions = null;
        this.storageName = null;
        this.resultAction = {};
        this.proxyOptions = null;
    }

    /**
    * See the parent class method for details
    */
    init(options) {
        options = options || {};
        super.init(options);

        return this._getInstanceMetadata()
            .then((metadata) => {
                this.resourceGroup = metadata.compute.resourceGroupName;
                this.primarySubscriptionId = metadata.compute.subscriptionId;
                this.region = metadata.compute.location;
                this.customerId = metadata.compute.subscriptionId;
                this.environment = this._getAzureEnvironment(metadata);
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
                return Promise.all([
                    this._getAuthToken(this.environment.resourceManagerEndpointUrl),
                    this._getAuthToken('https://storage.azure.com/')
                ]);
            })
            .then((tokens) => {
                this.resourceToken = tokens[0];
                this.storageToken = tokens[1];
                this.subscriptions = options.subscriptions || [];
                this.subscriptions.push(this.primarySubscriptionId);
                this.logger.silly('Subscriptions: ', this.subscriptions);
                return this._discoverStorageAccount();
            })
            .then((storageName) => {
                this.logger.silly('Storage Account Information: ', storageName);
                this.storageName = storageName;
                return this._initStorageAccountContainer();
            })
            .then(() => {
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
     * Gets token from metadata
     *
     * @param {String}  resource    - Resource to include in request scope
     *
     * @returns {String} Token
     *
     */
    _getAuthToken(resource) {
        const encodedResource = encodeURIComponent(resource);
        const headers = { Metadata: true, 'x-ms-version': X_MS_VERSION };

        return util.makeRequest(constants.METADATA_HOST, `/metadata/identity/oauth2/token?api-version=${METADATA_VERSION}&resource=${encodedResource}`, { headers, port: 80, protocol: 'http' })
            .then((response) => Promise.resolve(response.access_token))
            .catch((err) => {
                const message = `Error getting auth token ${err.message}`;
                return Promise.reject(new Error(message));
            });
    }

    /**
     * Send HTTP Request to Azure API
     *
     * @param {String} method       - HTTP method for the request
     * @param {String} requestUrl   - Full URL for the request
     * @param {Object} options      - Options to pass to the request
     *
     * @returns {Promise} A promise which will be resolved upon complete response
     *
     */
    _makeRequest(method, requestUrl, options) {
        if (!this.resourceToken || !this.storageToken) {
            return Promise.reject(new Error('_makeRequest: no auth token. call init first'));
        }

        const parsedUrl = url.parse(requestUrl);
        const host = parsedUrl.hostname;
        const uri = parsedUrl.pathname;
        const queryString = parsedUrl.query || null;

        options.requestScope = options.requestScope || 'resource';
        options.headers = options.headers || {};
        options.headers.Authorization = `Bearer ${options.requestScope === 'resource' ? this.resourceToken : this.storageToken}`;
        options.headers['x-ms-version'] = X_MS_VERSION;
        options.method = method;
        options.queryParams = queryString ? querystring.parse(queryString) : {};
        options.body = options.body || '';
        options.advancedReturn = options.advancedReturn || false;
        options.continueOnError = options.continueOnError || false;
        options.validateStatus = options.validateStatus || false;
        options.proxy = this.proxyOptions;

        return this._retrier(util.makeRequest, [host, uri, options], {
            retryInterval: NETWORK_RETRY_INTERVAL,
            maxRetries: NETWORK_MAX_RETRIES
        })
            .then((data) => Promise.resolve(data))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Update Addresses
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Object}
    */
    updateAddresses(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        const updateOperations = options.updateOperations;

        this.logger.silly('updateAddresses: ', options);

        if (updateOperations) {
            return this._updateAddresses(updateOperations)
                .catch((err) => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .then((operations) => this._updateAddresses(operations))
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
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        this.logger.silly('discoverAddresses: ', options);
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .catch((err) => Promise.reject(err));
    }

    /**
    * Upload data to storage (cloud)
    *
    * @param {Object} fileName                  - file name where data should be uploaded
    * @param {Object} data                      - data to upload
    * @param {Object}  options                  - Function options
    * @param {Integer} [options.maxRetries]     - Number of times to retry on failure
    * @param {Integer} [options.retryInterval]  - Milliseconds between retries
    *
    * @returns {Promise}
    */
    uploadDataToStorage(fileName, data) {
        this.logger.silly(`Data will be uploaded to ${fileName}: `, data);
        const requestScope = 'storage';
        const headers = {
            'Content-Length': Buffer.byteLength(JSON.stringify(data)),
            'x-ms-blob-type': 'BlockBlob',
            'x-ms-date': (new Date()).toUTCString()
        };
        return this._makeRequest('PUT', `https://${this.storageName}.blob${this.environment.storageEndpointSuffix}/${storageContainerName}/${fileName}`, { requestScope, headers, body: data })
            .then(() => Promise.resolve())
            .catch((err) => {
                const message = `Error in uploadDataToStorage ${err}`;
                return Promise.reject(new Error(message));
            });
    }

    /**
    * Download data from storage (cloud)
    *
    * @param {Object} fileName                  - file name where data should be downloaded
    * @param {Object}  options                  - Function options
    * @param {Integer} [options.maxRetries]     - Number of times to retry on failure
    * @param {Integer} [options.retryInterval]  - Milliseconds between retries
    *
    * @returns {Promise}
    */
    downloadDataFromStorage(fileName) {
        this.logger.silly(`Data will be downloaded from ${fileName}`);
        const requestScope = 'storage';
        return this._makeRequest('GET', `https://${this.storageName}.blob${this.environment.storageEndpointSuffix}/${storageContainerName}/${fileName}`, { requestScope, advancedReturn: true, continueOnError: true })
            .then((response) => {
                if (response.code === 404) {
                    this.logger.silly('downloadDataFromStorage could not find state file, continuing...');
                    return Promise.resolve({});
                }
                return Promise.resolve(response.body);
            })
            .catch((err) => {
                const message = `Error in downloadDataFromStorage ${err}`;
                return Promise.reject(new Error(message));
            });
    }

    /**
     * Discover address operations using definitions
     *
     * @param {Object} addresses                - failover addresses, local addresses
     * @param {Object} addressGroupDefinitions  - network interface names, virtual addresses, public IP name
     * @param {Object} options                  - function options
     *
     * @returns {Promise}
     */
    discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options) {
        this.logger.silly('discoverAddressOperationsUsingDefinitions options', options);
        this.resultAction = {
            publicAddresses: [],
            interfaces: {
                disassociate: [],
                associate: []
            },
            loadBalancerAddresses: {}
        };

        const networkInterfaceAddress = addressGroupDefinitions.filter((item) => item.type === 'networkInterfaceAddress');
        return Promise.all([
            this._discoverNetworkInterfaceAddress(networkInterfaceAddress, addresses)
        ])
            .then(() => this.resultAction)
            .catch((err) => Promise.reject(err));
    }

    _discoverNetworkInterfaceAddress(addressGroupDefinitions, addresses) {
        if (addressGroupDefinitions.length === 0) {
            return Promise.resolve();
        }
        this.logger.debug('Discover network interface address - same-net');

        return Promise.resolve(this._generateNetworkInterfaceOperations(addresses, addressGroupDefinitions));
    }

    /**
     * Get Associated Address and Route Info - Returns associated and route table information
     *
     * @param {Boolean} isAddressOperationsEnabled   - Are we inspecting addresses
     * @param {Boolean} isRouteOperationsEnabled     - Are we inspecting routes
     *
     * @returns {Object}
     */
    getAssociatedAddressAndRouteInfo(isAddressOperationsEnabled, isRouteOperationsEnabled) {
        const localAddresses = [];
        const publicIpIds = [];
        let vmName = '';
        const data = util.deepCopy(INSPECT_ADDRESSES_AND_ROUTES);
        return this._getInstanceMetadata()
            .then((metadata) => {
                this.logger.info('Fetching instance metadata');
                data.instance = metadata.compute.vmId;
                vmName = metadata.compute.name;
                return this._listNics({ tags: this.addressTags || null });
            })
            .then((nics) => {
                nics.forEach((nic) => {
                    if (nic.properties.virtualMachine.id.indexOf(vmName) !== -1) {
                        nic.properties.ipConfigurations.forEach((conf) => {
                            if (isAddressOperationsEnabled) {
                                data.addresses.push({
                                    privateIpAddress: conf.properties.privateIPAddress,
                                    publicIpAddress: conf.properties.publicIPAddress ? conf.properties.publicIPAddress.id : '',
                                    networkInterfaceId: nic.id
                                });
                                if (conf.properties.publicIPAddress) {
                                    publicIpIds.push(this._getPublicIpAddress({ publicIpAddress: conf.properties.publicIPAddress.id.split('/').pop() }));
                                }
                            }
                            localAddresses.push(conf.properties.privateIPAddress);
                        });
                    }
                });
                return Promise.all(publicIpIds);
            })
            .then((pips) => {
                pips.forEach((pip) => {
                    data.addresses.forEach((address) => {
                        if (address.publicIpAddress === pip.id) {
                            address.publicIpAddress = pip.ipAddress;
                        }
                    });
                });
                return isRouteOperationsEnabled ? this._getRouteTables() : [];
            })
            .then((routeTables) => {
                this.routeGroupDefinitions.forEach((routeGroup) => {
                    const filteredRouteTables = this._filterRouteTables(
                        routeTables,
                        {
                            tags: routeGroup.routeTags || null,
                            name: routeGroup.routeName || null
                        }
                    );
                    data.routes = data.routes.concat(this._discoverRoutesUsingNextHopAddress(
                        filteredRouteTables,
                        routeGroup,
                        localAddresses,
                        true
                    ));
                });
                this.logger.info('Returning associated address and route info');
                return Promise.resolve(data);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Discover Storage Account (scopingName)
    *
    * @returns {Object}
    */
    _discoverStorageAccount() {
        if (this.storageName) {
            return Promise.resolve(this.storageName);
        }
        return this._listStorageAccounts({ tags: this.storageTags })
            .then((storageAccounts) => {
                if (!storageAccounts.length) {
                    return Promise.reject(new Error('No storage account found!'));
                }
                return Promise.resolve(storageAccounts[0].name); // only need one
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Get Azure environment
    *
    * @returns {String}
    */
    _getAzureEnvironment(metadata) {
        if (Object.keys(this.customEnvironment).length > 0) {
            return this.customEnvironment;
        }
        const specialLocations = {
            AzurePublicCloud: 'Azure',
            AzureUSGovernmentCloud: 'AzureUSGovernment',
            AzureChinaCloud: 'AzureChina',
            AzureGermanCloud: 'AzureGermanCloud'
        };
        return constants.AZURE_ENVIRONMENTS[specialLocations[metadata.compute.azEnvironment]];
    }

    /**
    * Get instance metadata
    *
    * @returns {Promise}
    */
    _getInstanceMetadata() {
        const headers = { Metadata: true, 'x-ms-version': X_MS_VERSION };

        return util.makeRequest(constants.METADATA_HOST, `/metadata/instance?api-version=${METADATA_VERSION}`, { headers, port: 80, protocol: 'http' })
            .then((metaData) => Promise.resolve(metaData))
            .catch((err) => {
                const message = `Error getting instance metadata ${err.message}`;
                return Promise.reject(new Error(message));
            });
    }

    /**
    * Lists all storage accounts
    *
    * @param {Object} options        - function options
    * @param {Object} [options.tags] - object containing tags to filter on { 'key': 'value' }
    *
    * @returns {Promise}
    */
    _listStorageAccounts(options) {
        options = options || {};
        const tags = options.tags || {};

        this.logger.silly('Listing Storage Accounts');
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this.primarySubscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=${STORAGE_API_VERSION}`, {})
            .then((storageAccounts) => {
                if (tags) {
                    const tagKeys = Object.keys(tags);
                    const filteredStorageAccounts = storageAccounts.value.filter((sa) => {
                        let matchedTags = 0;
                        tagKeys.forEach((tagKey) => {
                            if (sa.tags && Object.keys(sa.tags).indexOf(tagKey) !== -1
                                && sa.tags[tagKey] === tags[tagKey]) {
                                matchedTags += 1;
                            }
                        });
                        return tagKeys.length === matchedTags;
                    });
                    return Promise.resolve(filteredStorageAccounts);
                }
                return Promise.resolve(storageAccounts);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Initialize (create if it does not exist) storage account container
    *
    * @param {String} name - storage account container name
    *
    * @returns {Promise}
    */
    _initStorageAccountContainer() {
        const requestScope = 'storage';
        return this._makeRequest('GET', `https://${this.storageName}.blob${this.environment.storageEndpointSuffix}/?comp=list`, { requestScope })
            .then((data) => {
                const template = parse(`<EnumerationResults><Containers><Container c-bind="Containers|array">
                        <Name>{{Name}}</Name>
                    </Container></Containers></EnumerationResults>`);
                const containers = template.fromXML(data).Containers || null;
                if (containers && containers[0].Name === storageContainerName) {
                    this.logger.silly('Container', storageContainerName, 'already exists, continuing...');
                    return Promise.resolve();
                }
                this.logger.silly('Container', storageContainerName, 'does not exist, creating...');
                return this._makeRequest('PUT', `https://${this.storageName}.blob${this.environment.storageEndpointSuffix}/${storageContainerName}?restype=container`, { requestScope })
                    .then(() => {
                        this.logger.silly('Container', storageContainerName, 'was created, continuing...');
                        return Promise.resolve();
                    });
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Lists all network interface configurations in this resource group
    *
    * @param {Object} options        - function options
    * @param {Object} [options.tags] - object containing tags to filter on { 'key': 'value' }
    *
    * @returns {Promise} A promise which can be resolved with a non-error response from Azure REST API
    */
    _listNics(options) {
        options = options || {};
        const tags = options.tags || {};

        this.logger.silly('Listing Network Interfaces');
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this.primarySubscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/networkInterfaces?api-version=${NETWORK_API_VERSION}`, {})
            .then((nics) => {
                if (tags) {
                    const tagKeys = Object.keys(tags);
                    const filteredNics = nics.value.filter((nic) => {
                        let matchedTags = 0;
                        tagKeys.forEach((tagKey) => {
                            if (nic.tags && Object.keys(nic.tags).indexOf(tagKey) !== -1
                                && nic.tags[tagKey] === tags[tagKey]) {
                                matchedTags += 1;
                            }
                        });
                        return tagKeys.length === matchedTags;
                    });
                    return Promise.resolve(filteredNics);
                }
                return Promise.resolve(nics);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Returns an array of IP configurations
    *
    * @param {Object} ipConfigurations - The Azure NIC IP configurations
    *
    * @returns {Array} An array of IP configurations
    */
    _getIpConfigs(ipConfigurations) {
        const nicArr = [];
        ipConfigurations.forEach((ipConfiguration) => {
            nicArr.push(ipConfiguration);
        });
        return nicArr;
    }

    /**
    * Update Nic
    *
    * @param {String} resourceGroup - resourceGroup
    * @param {String} nicName       - nicName
    * @param {String} nicParams     - nicParams
    * @param {String} action        - action
    *
    * @returns {Promise}
    */
    _updateNic([resourceGroup, nicName, nicParams, action]) {
        this.logger.debug(action, 'IP configurations on nic name:', nicName);

        return this._makeRequest('PUT', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this.primarySubscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkInterfaces/${nicName}?api-version=${NETWORK_API_VERSION}`, { body: nicParams })
            .then((response) => {
                this.logger.info('_updateNic successful.');
                return Promise.resolve(response);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Parse Nics - figure out which nics are 'mine' vs. 'theirs'
    *
    * @param {Object} nics              - nics
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Object} { 'mine': [], 'theirs': [] }
    */
    _parseNics(nics, localAddresses, failoverAddresses) {
        const myNics = [];
        const theirNics = [];
        // add nics to 'mine' or 'their' array based on address match
        nics.forEach((nic) => {
            if (nic.properties.provisioningState !== 'Succeeded') {
                this.logger.error(`Unexpected provisioning state: ${nic.properties.provisioningState}`);
            }
            // identify 'my' and 'their' nics
            const nicAddresses = nic.properties.ipConfigurations.map((i) => i.properties.privateIPAddress);
            localAddresses.forEach((address) => {
                const myNicIds = myNics.map((i) => i.nic.id);
                if (nicAddresses.indexOf(address) !== -1
                    && myNicIds.indexOf(nic.id) === -1) {
                    myNics.push({ nic });
                }
            });
            failoverAddresses.forEach((address) => {
                const theirNicIds = theirNics.map((i) => i.nic.id);
                if (nicAddresses.indexOf(address) !== -1
                    && theirNicIds.indexOf(nic.id) === -1) {
                    theirNics.push({ nic });
                }
            });
        });
        // remove any nics from 'their' array if they are also in 'my' array
        for (let p = myNics.length - 1; p >= 0; p -= 1) {
            for (let qp = theirNics.length - 1; qp >= 0; qp -= 1) {
                if (myNics[p].nic.id === theirNics[qp].nic.id) {
                    theirNics.splice(qp, 1);
                    break;
                }
            }
        }
        return { mine: myNics, theirs: theirNics };
    }

    /**
    * Discover address operations
    *
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Promise} { associate: {}, disassociate: {} }
    */
    _discoverAddressOperations(localAddresses, failoverAddresses) {
        this.logger.debug('_discoverAddressOperations localAddresses: ', localAddresses);
        this.logger.debug('_discoverAddressOperations failoverAddresses : ', failoverAddresses);
        if (!localAddresses || Object.keys(localAddresses).length === 0
            || !failoverAddresses || Object.keys(failoverAddresses).length === 0) {
            this.logger.info('No localAddresses/failoverAddresses to discover');
            return Promise.resolve({
                publicAddresses: [],
                interfaces: { disassociate: [], associate: [] },
                loadBalancerAddresses: {}
            });
        }
        this.logger.info('Discover Address operations using localAddresses', localAddresses, 'failoverAddresses', failoverAddresses, 'to discover');
        return this._listNics({ tags: this.addressTags || null })
            .then((nics) => {
                const parsedNics = this._parseNics(nics, localAddresses, failoverAddresses);
                return this._generateAddressOperations(localAddresses, failoverAddresses,
                    parsedNics);
            })
            .then((operations) => Promise.resolve({
                publicAddresses: [],
                interfaces: operations,
                loadBalancerAddresses: {}
            }))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Update addresses - given reassociate operation(s)
    *
    * @param {Object} operations - operations object { publicAddresses: {}, interfaces: [] }
    *
    * @returns {Promise}
    */
    _updateAddresses(operations) {
        if (!operations || !Object.keys(operations).length) {
            this.logger.debug('No update address operations to perform');
            return Promise.resolve();
        }
        this.logger.debug('Update address operations to perform', operations);
        return Promise.all([
            this._reassociateAddresses(operations.interfaces)
        ])
            .then(() => {
                this.logger.info('Addresses reassociated successfully');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Re-associates addresses to different NICs via disassociate and then associate operations
     *
     * @param {Object} operations - operations we should perform
     *
     * @returns {Promise}         - Resolves when all addresses are reassociated or rejects if an error occurs
     */
    _reassociateAddresses(operations) {
        /* eslint-disable max-len */
        /* eslint-disable quotes */
        operations = operations || {};
        const disassociate = operations.disassociate || [];
        const associate = operations.associate || [];

        if (!disassociate || Object.keys(disassociate).length === 0
            || !associate || Object.keys(associate).length === 0) {
            this.logger.silly('No disassociate/associate interface operations to update.');
            return Promise.resolve();
        }

        const disassociatePromises = [];
        disassociate.forEach((item) => {
            disassociatePromises.push(this._updateNic(item));
        });

        const nicStart = Math.floor(new Date().getTime() / 1000);
        return Promise.all(disassociatePromises)
            .then(() => {
                const disassociateNicStatusPromises = [];
                disassociate.forEach((item) => {
                    const disassociateNicName = item["1"];
                    disassociateNicStatusPromises.push(this._retrier(this._getNetworkInterfaceByName, [disassociateNicName], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });

                return Promise.all(disassociateNicStatusPromises);
            })
            .then(() => {
                this.logger.info('Disassociate NICs successful.');

                const associatePromises = [];
                associate.forEach((item) => {
                    associatePromises.push(this._updateNic(item));
                });

                return Promise.all(associatePromises);
            })
            .then(() => {
                const associateNicStatusPromises = [];
                associate.forEach((item) => {
                    const associateNicName = item["1"];
                    associateNicStatusPromises.push(this._retrier(this._getNetworkInterfaceByName, [associateNicName], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });

                return Promise.all(associateNicStatusPromises);
            })
            .then(() => {
                const nicStop = Math.floor(new Date().getTime() / 1000);
                this.logger.silly('Elapsed time to update network interfaces:', (nicStop - nicStart), 'seconds');
                this.logger.info('Associate NICs successful.');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Check for any NIC operations required
     *
     * @param {Array} myNics             - 'my' NIC object
     * @param {Object} theirNic          - 'their' NIC object
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Object} { 'disasociate': [], 'association: [] }
     */
    _checkForNicOperations(myNic, theirNic, failoverAddresses) {
        const theirNicIpConfigs = this._getIpConfigs(theirNic.properties.ipConfigurations);
        const myNicIpConfigs = this._getIpConfigs(myNic.properties.ipConfigurations);

        this.logger.silly('checking for NIC operations for my/their NIC pair:', myNic.name, theirNic.name);

        for (let i = theirNicIpConfigs.length - 1; i >= 0; i -= 1) {
            for (let t = failoverAddresses.length - 1; t >= 0; t -= 1) {
                if (failoverAddresses[t] === theirNicIpConfigs[i].properties.privateIPAddress) {
                    this.logger.silly('Match:', theirNicIpConfigs[i].properties.privateIPAddress);
                    myNicIpConfigs.push(theirNicIpConfigs[i]);
                    theirNicIpConfigs.splice(i, 1);
                    break;
                }
            }
        }
        theirNic.properties.ipConfigurations = theirNicIpConfigs;
        myNic.properties.ipConfigurations = myNicIpConfigs;
        return {
            disassociate: [
                this.resourceGroup,
                theirNic.name,
                theirNic,
                'Disassociate'
            ],
            associate: [
                this.resourceGroup,
                myNic.name,
                myNic,
                'Associate'
            ]
        };
    }

    /**
    * Get route tables
    *
    * @returns {Promise}
    */
    _getRouteTables() {
        return Promise.all(Object.values(this.subscriptions).map((id) => this._listRouteTablesBySubscription(id)))
            .then((routeTables) => Promise.resolve(Array.prototype.concat.apply([], routeTables)))
            .catch((err) => Promise.reject(err));
    }

    /**
    * List route tables
    *
    * @param {String} id - Subscription ID
    *
    * @returns {Promise}
    */
    _listRouteTablesBySubscription(id) {
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${id}/providers/Microsoft.Network/routeTables?api-version=${NETWORK_API_VERSION}`, {})
            .then((data) => {
                if (data.nextLink) {
                    return Promise.resolve(this._listRouteTablesBySubscriptionUsingNextPageLink(data.value, data.nextLink));
                }
                return Promise.resolve(data.value);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * List route tables from paginated response
    *
    * @param {Array} results    - Array of previously acquired route tables
    * @param {String} nextLink  - The URL of the next page of results to request
    *
    * @returns {Promise}
    */
    _listRouteTablesBySubscriptionUsingNextPageLink(results, nextLink) {
        return new Promise((resolve, reject) => {
            this._makeRequest('GET', nextLink, {})
                .then((data) => {
                    results = results.concat(data.value);
                    if (data.nextLink) {
                        this.logger.silly('_listRouteTablesBySubscriptionUsingNextPageLink called recursively to fetch next page');
                        this._listRouteTablesBySubscriptionUsingNextPageLink(data.value, nextLink)
                            .then((nextResults) => {
                                resolve(nextResults.value);
                            });
                    } else {
                        resolve(results);
                    }
                })
                .catch((err) => reject(err));
        });
    }

    /**
    * Filter local addresses - based on IPv4 or IPv6
    *
    * @param {Object} routePrefix - address prefix of route object
    *
    * @param {Object} localAddresses - local IP addresses on this device
    *
    * @returns {Object} {"0":"ace:cab:deca:deee::4","1":"ace:cab:deca:deef::4"}
    */
    _filterLocalAddresses(routePrefix, localAddresses) {
        let ipVersion = '4';
        let selfAddress = '';
        const filteredLocalAddresses = [];

        const routeAddress = new IPAddressLib.Address6(routePrefix.split('/')[0]);
        if (routeAddress.isValid()) {
            ipVersion = '6';
        }

        localAddresses.forEach((address) => {
            if (ipVersion === '6') {
                selfAddress = new IPAddressLib.Address6(address);
            } else {
                selfAddress = new IPAddressLib.Address4(address);
            }
            if (selfAddress.isValid()) {
                this.logger.silly('Using ipVersion', ipVersion, 'with local address:', address);
                filteredLocalAddresses.push(address);
            }
        });

        return filteredLocalAddresses;
    }

    /**
     * Discover route operations (per group)
     *
     * @param {Object} localAddresses   - local addresses
     * @param {Object} routeGroup       - route table groups to process
     * @param {Array} routeTables       - all route tables fetched for the region
     *
     * @returns {Object} { operations: ['id', 'name', 'routeName', {}] }
     */
    _discoverRouteOperationsPerGroup(localAddresses, routeGroup, routeTables) {
        const filteredRouteTables = this._filterRouteTables(
            routeTables,
            {
                tags: routeGroup.routeTags || null,
                name: routeGroup.routeName || null
            }
        );
        return this._discoverRoutesUsingNextHopAddress(filteredRouteTables, routeGroup, localAddresses);
    }

    /**
     * Discover routes (using next hop address)
     *
     * @param {Object} routeTables     - route tables
     * @param {Object} routeGroup      - route table group to process
     * @param {Array} localAddresses   - local addresses
     * @param {Boolean} getLocalRoutes - get local routes
     *
     * @returns {Object} [{ routeTableId: '', routeTableName: '', networkId: '' }]
     */
    _discoverRoutesUsingNextHopAddress(routeTables, routeGroup, localAddresses, getLocalRoutes) {
        const data = [];
        getLocalRoutes = getLocalRoutes || false;
        routeTables.forEach((routeTable) => {
            this.logger.silly('Discovering updates for route table', routeTable.name);
            routeTable.properties.routes.forEach((route) => {
                this.logger.silly(`Route.name: ${route.name}`);
                this.logger.silly(`Route.nextHopIpAddress: ${route.properties.nextHopIpAddress}`);
                this.logger.silly(`Route.addressPrefix: ${route.properties.addressPrefix}`);
                const matchedAddressRange = this._matchRouteToAddressRange(
                    route.properties.addressPrefix,
                    routeGroup.routeAddressRanges
                );
                if (matchedAddressRange) {
                    const filteredLocalAddresses = this._filterLocalAddresses(
                        route.properties.addressPrefix,
                        localAddresses
                    );
                    const nextHopAddress = this._discoverNextHopAddress(
                        filteredLocalAddresses,
                        routeTable.tags,
                        matchedAddressRange.routeNextHopAddresses
                    );
                    this.logger.silly('Discovered nextHopAddress', nextHopAddress);
                    if (nextHopAddress) {
                        if (!getLocalRoutes && route.properties.nextHopIpAddress !== nextHopAddress) {
                            route.nextHopIpAddress = nextHopAddress;
                            const parameters = [routeTable.id.split('/')[4], routeTable.name, route.name, route];
                            data.push(parameters);
                        } else if (getLocalRoutes && nextHopAddress === route.properties.nextHopIpAddress) {
                            this.logger.silly('this is an associated route', routeTable);
                            data.push({
                                routeTableId: routeTable.id,
                                routeTableName: routeTable.name,
                                networkId: routeTable.properties.subnets && routeTable.properties.subnets.length ? routeTable.properties.subnets[0].id : ''
                            });
                        }
                    }
                }
            });
        });
        return data;
    }

    /**
    * Update routes (given reassociate operations)
    *
    * @param {Array} operations - operations array
    *
    * @returns {Promise}
    */
    _updateRoutes(operations) {
        // this.logger.debug('updateRoutes operations: ', operations);

        if (!operations || Object.keys(operations).length === 0) {
            this.logger.info('No route operations to run');
            return Promise.resolve();
        }

        const routeTableList = [];
        const routeTableOperationsPromises = [];
        operations.forEach((item) => {
            const name = item["1"];
            const group = item["0"];
            const id = item["3"].id.split('/').slice(0, 9).join('/');
            routeTableList.push({ name, group, id });
        });
        const routeTableListFiltered = routeTableList.filter((item, index, self) => index === self.findIndex((i) => i.name === item.name && i.group === item.group && i.id === item.id));
        routeTableListFiltered.forEach((item) => {
            routeTableOperationsPromises.push(this._getRouteTableConfig(item.group, item.name, item.id));
        });

        const routeStart = Math.floor(new Date().getTime() / 1000);
        return Promise.all(routeTableOperationsPromises)
            .then((routeTableConfigs) => {
                const operationsPromises = [];
                const opRoutes = [];
                Object.keys(operations).forEach((opRoute) => {
                    opRoutes.push(
                        {
                            name: operations[opRoute]["3"].name,
                            id: operations[opRoute]["3"].id,
                            addressPrefix: operations[opRoute]["3"].addressPrefix,
                            nextHopType: operations[opRoute]["3"].nextHopType,
                            nextHopIpAddress: operations[opRoute]["3"].nextHopIpAddress
                        }
                    );
                });

                routeTableConfigs.forEach((routeTableConfig) => {
                    this.logger.silly('_updateRoutes sending routeTableConfig:', routeTableConfig);
                    const routeTableName = routeTableConfig.name;
                    const routeTableId = routeTableConfig.id;
                    const routeTableGroup = routeTableConfig.id.split('/')[4];
                    Object.keys(routeTableConfig.properties.routes).forEach((oldRoute) => {
                        Object.keys(opRoutes).forEach((opRoute) => {
                            if (routeTableConfig.properties.routes[oldRoute].id === opRoutes[opRoute].id) {
                                this.logger.silly('Updating matching route', routeTableConfig.properties.routes[oldRoute].name, 'to use next hop address', opRoutes[opRoute].nextHopIpAddress);
                                routeTableConfig.properties.routes[oldRoute].properties.nextHopType = 'VirtualAppliance';
                                routeTableConfig.properties.routes[oldRoute].properties.nextHopIpAddress = opRoutes[opRoute].nextHopIpAddress;
                            }
                        });
                    });
                    operationsPromises.push(this._updateRouteTable(routeTableGroup, routeTableName, routeTableConfig, routeTableId));
                });
                return Promise.all(operationsPromises);
            })
            .then(() => {
                const operationsStatusPromises = [];
                routeTableListFiltered.forEach((item) => {
                    operationsStatusPromises.push(this._retrier(this._getRouteTableByName, [item.group, item.name, item.id], {
                        retryInterval: NETWORK_RETRY_INTERVAL,
                        maxRetries: NETWORK_MAX_RETRIES
                    }));
                });
                return Promise.all(operationsStatusPromises);
            })
            .then(() => {
                const routeStop = Math.floor(new Date().getTime() / 1000);
                this.logger.silly('Elapsed time to update route tables:', (routeStop - routeStart), 'seconds');
                this.logger.info('Update routes successful.');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Updates specified Azure user defined route table
    *
    * @param {String} routeTableGroup   - Name of the route table resource group
    * @param {String} routeTableName    - Name of the route table
    * @param {Array}  routeTableConfig  - Array of new route configuration
    * @param {Array}  routeTableId      - Route table ID
    *
    * @returns {Promise} A promise which can be resolved with a non-error response from Azure REST API
    */
    _updateRouteTable(routeTableGroup, routeTableName, routeTableConfig, routeTableId) {
        this.logger.silly('Updating route table: ', routeTableName);

        return this._makeRequest('PUT', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this._parseResourceId(routeTableId).subscriptionId}/resourceGroups/${routeTableGroup}/providers/Microsoft.Network/routeTables/${routeTableName}?api-version=${NETWORK_API_VERSION}`, { body: routeTableConfig })
            .then((response) => {
                this.logger.info('_updateRouteTable successful.');
                return Promise.resolve(response);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Parse resource ID
    *
    * @returns {Object} { subscriptionId: '' }
    */
    _parseResourceId(resourceString) {
        return {
            subscriptionId: resourceString.split('/')[2]
        };
    }

    /**
     * Creates resource id
     *
     * @param {Object} options
     * @param {String} options.provider
     * @param {String} options.name
     * @param {String} options.resourceId
     *
     * @returns {Promise} - Returns resource id
     */
    _createResourceID(options) {
        options = options || {};
        if (options.provider && options.name && options.name.indexOf('/subscriptions/') === -1) {
            return `/subscriptions/${this.primarySubscriptionId}/resourceGroups/${this.resourceGroup}/providers/${options.provider}/${options.name}`;
        }
        return options.name;
    }

    /**
     * Generate network interface operations required to reassociate the addresses
     *
     * @param {Object} addresses            - local addresses
     * @param {Object} providedDeclaration  - network interface scoping address
     *
     * @returns {Promise} - A Promise that is resolved network interface operations
     */
    _generateNetworkInterfaceOperations(addresses, addressGroupDefinitions) {
        const failoverAddresses = [];
        const operations = {
            disassociate: [],
            associate: []
        };
        return Promise.all([
            this._listNics({ tags: this.addressTags })
        ])
            .then((results) => {
                const nics = results[0];
                addressGroupDefinitions.forEach((item) => {
                    failoverAddresses.push(item.scopingAddress);
                });
                const parsedNics = this._parseNics(nics, addresses.localAddresses, failoverAddresses);
                if (parsedNics.mine.length === 0 || parsedNics.theirs.length === 0) {
                    this.logger.warning('Problem with discovering network interfaces parsedNics');
                    return Promise.resolve({
                        publicAddresses: {},
                        interfaces: operations,
                        loadBalancerAddresses: {}
                    });
                }
                for (let s = parsedNics.mine.length - 1; s >= 0; s -= 1) {
                    for (let h = parsedNics.theirs.length - 1; h >= 0; h -= 1) {
                        const theirNic = parsedNics.theirs[h].nic;
                        const myNic = parsedNics.mine[s].nic;
                        /* eslint-disable max-len */
                        if (theirNic.properties.ipConfigurations[0].properties.subnet.id === undefined || myNic.properties.ipConfigurations[0].properties.subnet.id === undefined) {
                            this.logger.warning('Subnet ID values do not match or do not exist for a interface');
                        } else if (theirNic.properties.ipConfigurations[0].properties.subnet.id === myNic.properties.ipConfigurations[0].properties.subnet.id) {
                            const nicOperations = this._checkForNicOperations(myNic, theirNic, failoverAddresses);

                            if (nicOperations.disassociate && nicOperations.associate) {
                                operations.disassociate.push(nicOperations.disassociate);
                                operations.associate.push(nicOperations.associate);
                            }
                        }
                    }
                }
                this.resultAction.interfaces = operations;
                return Promise.resolve();
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Gets the public IP address resource - given a public IP name
     *
     * @param {Object} options                 - function options
     * @param {Object} options.publicIpAddress - object containing the name of the public IP address
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _getPublicIpAddress(options) {
        options = options || {};
        const publicIpAddressName = options.publicIpAddress;
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this.primarySubscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${publicIpAddressName}?api-version=${NETWORK_API_VERSION}`, {})
            .then((response) => {
                if (response.name.match(publicIpAddressName)) {
                    return Promise.resolve(response);
                }
                this.logger.info('Provided public IP address name was not found');
                return Promise.resolve();
            })
            .catch((err) => {
                this.logger.silly(`Get public IP address status: ${err}`);
                return Promise.reject(err);
            });
    }

    /**
     * Gets network interface resource provisioning state - given a network interface name
     *
     * @param {String} networkInterfaceName - name of network interface
     *
     * @returns {Promise}                   - A Promise that will be resolved when the provisioning state is Succeeded
     */
    _getNetworkInterfaceByName(networkInterfaceName) {
        this.logger.silly(`Checking provisioning state of NIC: ${networkInterfaceName}`);
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this.primarySubscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${networkInterfaceName}?api-version=${NETWORK_API_VERSION}`, {})
            .then((response) => {
                this.logger.silly(`Provisioning state of NIC ${networkInterfaceName}: ${response.properties.provisioningState}`);
                if (response.name.match(networkInterfaceName) && response.properties.provisioningState.match('Succeeded')) {
                    return Promise.resolve(response);
                }
                return Promise.reject(new Error(`NIC ${networkInterfaceName} is not ready yet`));
            })
            .catch((err) => {
                this.logger.silly(`Get network interface by name. Status: ${err}`);
                return Promise.reject(err);
            });
    }

    /**
     * Gets route table resource provisioning state - given a route table name
     *
     * @param {String} routeTableGroup      - name of route table resource group
     * @param {String} routeTableName       - name of route table
     *
     * @returns {Promise}                   - A Promise that will be resolved when the provisioning state is Succeeded
     */
    _getRouteTableByName(routeTableGroup, routeTableName, routeTableId) {
        this.logger.silly(`Checking provisioning state of route table: ${routeTableName}`);
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this._parseResourceId(routeTableId).subscriptionId}/resourceGroups/${routeTableGroup}/providers/Microsoft.Network/routeTables/${routeTableName}?api-version=${NETWORK_API_VERSION}`, {})
            .then((response) => {
                this.logger.silly(`Provisioning state of route table ${routeTableName}: ${response.properties.provisioningState}`);
                if (response.name.match(routeTableName) && response.properties.provisioningState.match('Succeeded')) {
                    return Promise.resolve(response);
                }
                return Promise.reject(new Error(`Route table ${routeTableName} is not ready yet`));
            })
            .catch((err) => {
                this.logger.silly(`Get route table by name. Status:  ${err}`);
                return Promise.reject(err);
            });
    }

    /**
     * Gets route table resource configuration - given a route table name
     *
     * @param {String} routeTableGroup      - name of route table resource group
     * @param {String} routeTableName       - name of route table
     *
     * @returns {Promise}                   - A Promise that will be resolved with the route table configuration
     */
    _getRouteTableConfig(routeTableGroup, routeTableName, routeTableId) {
        this.logger.silly(`Getting config of route table: ${routeTableName}`);
        return this._makeRequest('GET', `${this.environment.resourceManagerEndpointUrl}subscriptions/${this._parseResourceId(routeTableId).subscriptionId}/resourceGroups/${routeTableGroup}/providers/Microsoft.Network/routeTables/${routeTableName}?api-version=${NETWORK_API_VERSION}`, {})
            .then((response) => {
                this.logger.silly(`Found existing config for ${routeTableName}:`, response);
                return Promise.resolve(response);
            })
            .catch((err) => {
                this.logger.silly(`Get route table config. Status: ${err}`);
                return Promise.reject(err);
            });
    }
}

module.exports = {
    Cloud
};
