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

const msRestAzure = require('ms-rest-azure');
const azureEnvironment = require('ms-rest-azure/lib/azureEnvironment');
const NetworkManagementClient = require('azure-arm-network');
const StorageManagementClient = require('azure-arm-storage');
const Storage = require('azure-storage');
const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
const util = require('../../util.js');
const constants = require('../../constants');

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

const CLOUD_PROVIDERS = constants.CLOUD_PROVIDERS;
const INSPECT_ADDRESSES_AND_ROUTES = require('../../constants').INSPECT_ADDRESSES_AND_ROUTES;

const storageContainerName = constants.STORAGE_FOLDER_NAME;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AZURE, options);

        this.resourceGroup = null;
        this.subscriptionId = null;

        this.networkClient = null;
        this.storageClient = null;
        this.storageOperationsClient = null;
    }

    /**
    * See the parent class method for details
    */
    init(options) {
        super.init(options);

        let environment;

        return this._getInstanceMetadata()
            .then((metadata) => {
                this.resourceGroup = metadata.compute.resourceGroupName;
                this.subscriptionId = metadata.compute.subscriptionId;

                environment = this._getAzureEnvironment(metadata);
                const msiOptions = {
                    resource: environment.resourceManagerEndpointUrl,
                    msiApiVersion: '2018-02-01'
                };
                const credentials = new msRestAzure.MSIVmTokenCredentials(msiOptions);

                this.networkClient = new NetworkManagementClient(
                    credentials,
                    this.subscriptionId,
                    environment.resourceManagerEndpointUrl
                );
                this.storageClient = new StorageManagementClient(
                    credentials,
                    this.subscriptionId,
                    environment.resourceManagerEndpointUrl
                );
                return this._listStorageAccounts({ tags: this.storageTags });
            })
            .then((storageAccounts) => {
                if (!storageAccounts.length) {
                    return Promise.reject(new Error('No storage account found!'));
                }
                const storageAccount = storageAccounts[0]; // only need one
                return this._getStorageAccountKey(storageAccount.name);
            })
            .then((storageAccountInfo) => {
                this.logger.silly('Storage Account Information: ', storageAccountInfo);

                this.storageOperationsClient = Storage.createBlobService(
                    storageAccountInfo.name,
                    storageAccountInfo.key,
                    `${storageAccountInfo.name}.blob${environment.storageEndpointSuffix}`
                );
                return this._initStorageAccountContainer(storageContainerName);
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update Addresses
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
    * @param {Boolean} [options.discoverOnly]     - only perform discovery operation
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Object}
    */
    updateAddresses(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        const discoverOnly = options.discoverOnly || false;
        const updateOperations = options.updateOperations;

        this.logger.silly('updateAddresses: ', options);

        if (discoverOnly === true) {
            return this._discoverAddressOperations(localAddresses, failoverAddresses)
                .catch(err => Promise.reject(err));
        }
        if (updateOperations) {
            return this._updateAddresses(updateOperations.disassociate, updateOperations.associate)
                .catch(err => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .then(operations => this._updateAddresses(operations.disassociate, operations.associate))
            .catch(err => Promise.reject(err));
    }

    /**
    * Update routes
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing 1+ local (self) addresses [ '192.0.2.1' ]
    * @param {Boolean} [options.discoverOnly]     - only perform discovery operation
    * @param {Object} [options.updateOperations] - skip discovery and perform 'these' update operations
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
                .catch(err => Promise.reject(err));
        }
        if (updateOperations) {
            return this._updateRoutes(updateOperations.operations)
                .catch(err => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverRouteOperations(localAddresses)
            .then(operations => this._updateRoutes(operations.operations))
            .catch(err => Promise.reject(err));
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

        return new Promise(((resolve, reject) => {
            this.storageOperationsClient.createBlockBlobFromText(
                storageContainerName, fileName, JSON.stringify(data), (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        }))
            .catch(err => Promise.reject(err));
    }

    /**
    * Download data from storage (cloud)
    *
    * @param {Object} fileName - file name where data should be downloaded
    *
    * @returns {Promise}
    */
    downloadDataFromStorage(fileName) {
        return new Promise(((resolve, reject) => {
            this.storageOperationsClient.doesBlobExist(
                storageContainerName, fileName, (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data.exists);
                    }
                }
            );
        }))
            .then((exists) => {
                if (exists === false) {
                    return Promise.resolve({});
                }
                return new Promise(((resolve, reject) => {
                    this.storageOperationsClient.getBlobToText(
                        storageContainerName, fileName, (err, data) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(JSON.parse(data));
                            }
                        }
                    );
                }));
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Get Associated Address and Route Info - Returns associated and route table information
     *
     * @returns {Object}
     */
    getAssociatedAddressAndRouteInfo() {
        const localAddresses = [];
        const data = util.deepCopy(INSPECT_ADDRESSES_AND_ROUTES);
        return this._getInstanceMetadata()
            .then((metadata) => {
                this.logger.info('Fetching instance metadata');
                data.instance = metadata.compute.vmId;
                metadata.network.interface.forEach((nic) => {
                    data.addresses.push(nic.ipv4.ipAddress[0]);
                    localAddresses.push(nic.ipv4.ipAddress[0].privateIpAddress);
                });
            })
            .then(() => this._getRouteTables({ tags: this.routeTags }))
            .then((routeTables) => {
                this.logger.info('Fetching instance route tables');
                routeTables.forEach((routeTable) => {
                    routeTable.routes.forEach((route) => {
                        const matchedAddressRange = this._matchRouteToAddressRange(route.addressPrefix);
                        if (matchedAddressRange) {
                            const nextHopAddress = this._discoverNextHopAddress(
                                localAddresses,
                                routeTable.tags,
                                matchedAddressRange.routeNextHopAddresses
                            );

                            if (nextHopAddress && nextHopAddress === route.nextHopIpAddress) {
                                this.logger.silly('this is an associated route', routeTable);
                                data.routes.push({
                                    routeTableId: routeTable.id,
                                    routeTableName: routeTable.name,
                                    networkId: routeTable.subnets && routeTable.subnets.length ? routeTable.subnets[0].id : ''
                                });
                            }
                        }
                    });
                });
                this.logger.info('Returning associated address and route info');
                return Promise.resolve(data);
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Get Azure environment
    *
    * @returns {String}
    */
    _getAzureEnvironment(metadata) {
        const specialLocations = {
            AzurePublicCloud: 'Azure',
            AzureUSGovernmentCloud: 'AzureUSGovernment',
            AzureChinaCloud: 'AzureChina',
            AzureGermanCloud: 'AzureGermanCloud'
        };
        return azureEnvironment[specialLocations[metadata.compute.azEnvironment]];
    }

    /**
    * Get instance metadata
    *
    * @returns {Promise}
    */
    _getInstanceMetadata() {
        return new Promise((resolve, reject) => {
            cloudLibsUtil.getDataFromUrl(
                'http://169.254.169.254/metadata/instance?api-version=2018-10-01',
                {
                    headers: {
                        Metadata: true
                    }
                }
            )
                .then((metaData) => {
                    resolve(metaData);
                })
                .catch((err) => {
                    reject(err);
                });
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

        return this.storageClient.storageAccounts.list()
            .then((storageAccounts) => {
                // if true, filter storage accounts based on 1+ tags
                if (tags) {
                    const tagKeys = Object.keys(tags);
                    const filteredStorageAccounts = storageAccounts.filter((sa) => {
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
            .catch(err => Promise.reject(err));
    }

    /**
    * Get key for a specified storage accounts
    *
    * @param {String} name - storage account name
    *
    * @returns {Promise}
    */
    _getStorageAccountKey(name) {
        return this.storageClient.storageAccounts.listKeys(this.resourceGroup, name)
            .then((data) => {
                // simply grab the first key, for now
                const key = data.keys[0].value;
                return Promise.resolve({ name, key });
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Initialize (create if it does not exist) storage account container
    *
    * @param {String} name - storage account container name
    *
    * @returns {Promise}
    */
    _initStorageAccountContainer(name) {
        return new Promise(((resolve, reject) => {
            this.storageOperationsClient.createContainerIfNotExists(name, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        }))
            .catch(err => Promise.reject(err));
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
        const tags = options.tags || {};

        return new Promise(
            ((resolve, reject) => {
                this.networkClient.networkInterfaces.list(this.resourceGroup,
                    (error, data) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(data);
                        }
                    });
            })
        )
            .then((nics) => {
                // if true, filter nics based on an array of tags
                if (tags) {
                    const tagKeys = Object.keys(tags);
                    const filteredNics = nics.filter((nic) => {
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
            .catch(err => Promise.reject(err));
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
    * @param {String} group     - group
    * @param {String} nicName   - nicName
    * @param {String} nicParams - nicParams
    * @param {String} action    - action
    *
    * @returns {Promise}
    */
    _updateNic(group, nicName, nicParams, action) {
        return new Promise(
            ((resolve, reject) => {
                this.logger.debug(action, 'NIC: ', nicName);

                this.networkClient.networkInterfaces.createOrUpdate(group, nicName,
                    nicParams,
                    (error, data) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(data);
                        }
                    });
            })
        );
    }

    /**
    * Parse Nics - figure out which nics are 'mine' vs. 'theirs'
    *
    * @param {Object} nics              - nics
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Promise}
    */
    _parseNics(nics, localAddresses, failoverAddresses) {
        const myNics = [];
        const theirNics = [];
        // add nics to 'mine' or 'their' array based on address match
        nics.forEach((nic) => {
            if (nic.provisioningState !== 'Succeeded') {
                this.logger.error(`Unexpected provisioning state: ${nic.provisioningState}`);
            }
            // identify 'my' and 'their' nics
            const nicAddresses = nic.ipConfigurations.map(i => i.privateIPAddress);
            localAddresses.forEach((address) => {
                const myNicIds = myNics.map(i => i.nic.id);
                if (nicAddresses.indexOf(address) !== -1
                    && myNicIds.indexOf(nic.id) === -1) {
                    myNics.push({ nic });
                }
            });
            failoverAddresses.forEach((address) => {
                const theirNicIds = theirNics.map(i => i.nic.id);
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
        return { myNics, theirNics };
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
        if (!localAddresses || Object.keys(localAddresses).length === 0
            || !failoverAddresses || Object.keys(failoverAddresses).length === 0) {
            this.logger.info('No localAddresses/failoverAddresses to discover');
            return Promise.resolve({ disassociate: [], associate: [] });
        }

        return this._listNics({ tags: this.tags || null })
            .then((nics) => {
                const disassociate = [];
                const associate = [];

                const parsedNics = this._parseNics(nics, localAddresses, failoverAddresses);
                const myNics = parsedNics.myNics;
                const theirNics = parsedNics.theirNics;
                const failoverNicTag = constants.NIC_TAG;

                if (!myNics || !theirNics) {
                    this.logger.error('Could not determine network interfaces.');
                }

                // go through 'their' nics and come up with disassociate/associate actions required
                // to move ip configurations to 'my' nics, if any are required
                for (let s = myNics.length - 1; s >= 0; s -= 1) {
                    for (let h = theirNics.length - 1; h >= 0; h -= 1) {
                        if (theirNics[h].nic.tags[failoverNicTag] === undefined
                            || myNics[s].nic.tags[failoverNicTag] === undefined) {
                            this.logger.warning(`${failoverNicTag} tag values do not match or doesn't exist for a interface`);
                        } else if (theirNics[h].nic.tags[failoverNicTag] === myNics[s].nic.tags[failoverNicTag]) {
                            const theirNic = theirNics[h].nic;
                            const myNic = myNics[s].nic;
                            const theirNicIpConfigs = this._getIpConfigs(theirNic.ipConfigurations);
                            const myNicIpConfigs = this._getIpConfigs(myNic.ipConfigurations);

                            for (let i = theirNicIpConfigs.length - 1; i >= 0; i -= 1) {
                                for (let t = failoverAddresses.length - 1; t >= 0; t -= 1) {
                                    if (failoverAddresses[t] === theirNicIpConfigs[i].privateIPAddress) {
                                        this.logger.silly('Match:', theirNicIpConfigs[i].privateIPAddress);

                                        myNicIpConfigs.push(theirNicIpConfigs[i]);
                                        theirNicIpConfigs.splice(i, 1);
                                        break;
                                    }
                                }
                            }

                            theirNic.ipConfigurations = theirNicIpConfigs;
                            myNic.ipConfigurations = myNicIpConfigs;

                            disassociate.push([this.resourceGroup, theirNic.name, theirNic,
                                'Disassociate']);
                            associate.push([this.resourceGroup, myNic.name, myNic,
                                'Associate']);
                            break;
                        }
                    }
                }
                return Promise.resolve({ disassociate, associate });
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update addresses (given disassociate/associate operations)
    *
    * @param {Array} disassociate - Disassociate array
    * @param {Array} associate    - Associate array
    *
    * @returns {Promise}
    */
    _updateAddresses(disassociate, associate) {
        this.logger.debug('updateAddresses disassociate operations: ', disassociate);
        this.logger.debug('updateAddresses associate operations: ', associate);

        if (!disassociate || Object.keys(disassociate).length === 0
            || !associate || Object.keys(associate).length === 0) {
            this.logger.info('No associate/disassociate operations to update.');
            return Promise.resolve();
        }
        const disassociatePromises = [];
        disassociate.forEach((item) => {
            disassociatePromises.push(this._retrier(this._updateNic, item));
        });
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.info('Disassociate NICs successful.');

                const associatePromises = [];
                associate.forEach((item) => {
                    associatePromises.push(this._retrier(this._updateNic, item));
                });
                return Promise.all(associatePromises);
            })
            .then(() => {
                this.logger.info('Associate NICs successful.');
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Get route tables
    *
    * @param {Object} options        - function options
    * @param {Object} [options.tags] - object containing 1+ tags to filter on { 'key': 'value' }
    *
    * @returns {Promise}
    */
    _getRouteTables(options) {
        const tags = options.tags || {};

        return new Promise((resolve, reject) => {
            this.networkClient.routeTables.listAll((error, data) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        })
            .then((routeTables) => {
                // filter route tables based on tag(s)
                routeTables = this._filterRouteTablesByTag(routeTables, tags);
                return Promise.resolve(routeTables);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Filter route tables based on tags
     *
     * @param {Object} routeTables        - route tables
     * @param {Object} tags               - tags to filter on { 'key': 'value' }
     *
     * @returns {object} routeTables      - filtered route tables
     */
    _filterRouteTablesByTag(routeTables, tags) {
        if (tags) {
            routeTables = routeTables.filter((item) => {
                let matchedTags = 0;
                const tagKeys = Object.keys(tags);
                tagKeys.forEach((key) => {
                    if (item.tags && Object.keys(item.tags).indexOf(key) !== -1
                        && item.tags[key] === tags[key]) {
                        matchedTags += 1;
                    }
                });
                return tagKeys.length === matchedTags;
            });
        }
        return routeTables;
    }

    /**
    * Discover route operations
    *
    * @param {Object} localAddresses - local addresses
    *
    * @returns {Promise} { operations: ['id', 'name', 'routeName', {}] }
    */
    _discoverRouteOperations(localAddresses) {
        return this._getRouteTables({ tags: this.routeTags })
            .then((routeTables) => {
                this.logger.silly('Route tables', routeTables);
                const operations = [];
                // for each route table go through routes and discover any necessary updates
                routeTables.forEach((routeTable) => {
                    routeTable.routes.forEach((route) => {
                        const matchedAddressRange = this._matchRouteToAddressRange(route.addressPrefix);
                        if (matchedAddressRange) {
                            const nextHopAddress = this._discoverNextHopAddress(
                                localAddresses,
                                routeTable.tags,
                                matchedAddressRange.routeNextHopAddresses
                            );
                            if (nextHopAddress && route.nextHopIpAddress !== nextHopAddress) {
                                route.nextHopIpAddress = nextHopAddress;
                                const parameters = [routeTable.id.split('/')[4], routeTable.name, route.name, route];
                                operations.push(parameters);
                            }
                        }
                    });
                });
                return Promise.resolve({ operations });
            })
            .catch(err => Promise.reject(err));
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

        if (!operations || Object.keys(operations).length === 0) {
            this.logger.info('No route operations to run');
            return Promise.resolve();
        }

        const operationsPromises = [];
        operations.forEach((item) => {
            operationsPromises.push(this._retrier(this._updateRoute, item));
        });
        return Promise.all(operationsPromises)
            .then(() => {
                this.logger.info('Update routes successful.');
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Updates specified Azure user defined routes
    *
    * @param {String} routeTableGroup - Name of the route table resource group
    * @param {String} routeTableName  - Name of the route table
    * @param {String} routeName       - Name of the route to update
    * @param {Array} routeOptions     - route options
    *
    * @returns {Promise} A promise which can be resolved with a non-error response from Azure REST API
    */
    _updateRoute(routeTableGroup, routeTableName, routeName, routeOptions) {
        this.logger.debug('Updating route table: ', routeTableName, routeName, routeOptions);

        return new Promise((resolve, reject) => {
            this.networkClient.routes.beginCreateOrUpdate(
                routeTableGroup, routeTableName, routeName, routeOptions,
                (error, data) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(data);
                    }
                }
            );
        });
    }
}

module.exports = {
    Cloud
};
