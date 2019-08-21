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
const shortRetry = { maxRetries: 4, retryIntervalMs: 15000 };
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
    * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
    *
    * @param {Object} options                   - function options
    * @param {Object} [options.tags]            - object containing tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeTags]       - object containing tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeAddresses]  - object containing addresses to filter on [ '192.0.2.0/24' ]
    * @param {String} [options.routeSelfIpsTag] - object containing self IP's tag to match against: 'F5_SELF_IPS'
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || {};
        this.routeTags = options.routeTags || {};
        this.routeAddresses = options.routeAddresses || [];
        this.routeSelfIpsTag = options.routeSelfIpsTag || '';
        this.storageTags = options.storageTags || {};

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
    * @param {Object} localAddresses    - Local addresses
    * @param {String} failoverAddresses - Failover addresses
    *
    * @returns {Object}
    */
    updateAddresses(localAddresses, failoverAddresses) {
        return this._listNics({ tags: this.tags || null })
            .then((nics) => {
                const myNics = [];
                const theirNics = [];
                const disassociate = [];
                const associate = [];

                // add nics to 'mine' or 'their' array based on address match
                nics.forEach((nic) => {
                    if (nic.provisioningState !== 'Succeeded') {
                        this.logger.error(`Unexpected provisioning state: ${nic.provisioningState}`);
                    }

                    // identify 'my' and 'their' nics
                    nic.ipConfigurations.forEach((ipConfiguration) => {
                        localAddresses.forEach((address) => {
                            if (ipConfiguration.privateIPAddress === address) {
                                if (myNics.indexOf(nic) === -1) {
                                    myNics.push({ nic });
                                }
                            }
                        });
                        failoverAddresses.forEach((address) => {
                            if (ipConfiguration.privateIPAddress === address) {
                                if (theirNics.indexOf(nic) === -1) {
                                    theirNics.push({ nic });
                                }
                            }
                        });
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

                if (!myNics || !theirNics) {
                    this.logger.error('Could not determine network interfaces.');
                }

                // go through 'their' nics and come up with disassociate/associate actions required
                // to move ip configurations to 'my' nics, if any are required
                for (let s = myNics.length - 1; s >= 0; s -= 1) {
                    for (let h = theirNics.length - 1; h >= 0; h -= 1) {
                        if (theirNics[h].nic.name !== myNics[s].nic.name
                            && theirNics[h].nic.name.slice(0, -1) === myNics[s].nic.name.slice(0, -1)) {
                            let myNic = [];
                            let theirNic = [];
                            const ourLocation = myNics[s].nic.location;
                            const theirNsg = theirNics[h].nic.networkSecurityGroup;
                            const myNsg = myNics[s].nic.networkSecurityGroup;
                            const theirIpForwarding = theirNics[h].nic.enableIPForwarding;
                            const myIpForwarding = myNics[s].nic.enableIPForwarding;
                            const theirTags = theirNics[h].nic.tags;
                            const myTags = myNics[s].nic.tags;

                            myNic = this._getIpConfigs(myNics[s].nic.ipConfigurations);
                            theirNic = this._getIpConfigs(theirNics[h].nic.ipConfigurations);

                            for (let i = theirNic.length - 1; i >= 0; i -= 1) {
                                for (let t = failoverAddresses.length - 1; t >= 0; t -= 1) {
                                    if (failoverAddresses[t] === theirNic[i].privateIPAddress) {
                                        this.logger.silly('Match:', theirNic[i].privateIPAddress);

                                        myNic.push(this._getNicConfig(theirNic[i]));
                                        theirNic.splice(i, 1);
                                        break;
                                    }
                                }
                            }

                            const theirNicParams = {
                                location: ourLocation,
                                ipConfigurations: theirNic,
                                networkSecurityGroup: theirNsg,
                                tags: theirTags,
                                enableIPForwarding: theirIpForwarding
                            };
                            const myNicParams = {
                                location: ourLocation,
                                ipConfigurations: myNic,
                                networkSecurityGroup: myNsg,
                                tags: myTags,
                                enableIPForwarding: myIpForwarding
                            };

                            disassociate.push([this.resourceGroup, theirNics[h].nic.name, theirNicParams,
                                'Disassociate']);
                            associate.push([this.resourceGroup, myNics[s].nic.name, myNicParams,
                                'Associate']);
                            break;
                        }
                    }
                }
                return this._updateAssociations(disassociate, associate);
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update routes
    *
    * @param {Object} options                  - function options
    * @param {Object} [options.localAddresses] - object containing 1+ local (self) addresses [ '192.0.2.1' ]
    *
    * @returns {Promise}
    */
    updateRoutes(options) {
        const localAddresses = options.localAddresses || [];
        this.logger.debug('Local addresses', localAddresses);

        return this._getRouteTables({ tags: this.routeTags })
            .then((routeTables) => {
                this.logger.debug('Route tables', routeTables);
                const promises = [];

                // for each route table go through routes and update any necessary
                routeTables.forEach((routeTable) => {
                    const selfIpsToUse = routeTable.tags[this.routeSelfIpsTag].split(',').map(i => i.trim());
                    const selfIpToUse = selfIpsToUse.filter(item => localAddresses.indexOf(item) !== -1)[0];

                    routeTable.routes.forEach((route) => {
                        if (this.routeAddresses.indexOf(route.addressPrefix) !== -1) {
                            // update route
                            route.nextHopIpAddress = selfIpToUse;
                            const parameters = [routeTable.id.split('/')[4], routeTable.name, route.name, route];
                            promises.push(util.retrier.call(this, this._updateRoute, parameters, shortRetry));
                        }
                    });
                });
                return Promise.all(promises);
            })
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
            this.storageOperationsClient.getBlobToText(
                storageContainerName, fileName, (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(JSON.parse(data));
                    }
                }
            );
        }))
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
        const tags = options.tags || {};

        return this.storageClient.storageAccounts.list()
            .then((storageAccounts) => {
                // if true, filter storage accounts based on 1+ tags
                if (tags) {
                    const tagKeys = Object.keys(tags);
                    const filteredStorageAccounts = storageAccounts.filter((sa) => {
                        let matchedTags = 0;
                        tagKeys.forEach((tagKey) => {
                            if (Object.keys(sa.tags).indexOf(tagKey) !== -1 && sa.tags[tagKey] === tags[tagKey]) {
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
                            if (Object.keys(nic.tags).indexOf(tagKey) !== -1 && nic.tags[tagKey] === tags[tagKey]) {
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
            nicArr.push(this._getNicConfig(ipConfiguration));
        });
        return nicArr;
    }

    /**
    * Returns a network interface IP configuration
    *
    * @param {Object} ipConfig - The full Azure IP configuration
    *
    * @returns {Array} An array of IP configuration parameters
    */
    _getNicConfig(ipConfig) {
        return {
            name: ipConfig.name,
            privateIPAllocationMethod: ipConfig.privateIPAllocationMethod,
            privateIPAddress: ipConfig.privateIPAddress,
            primary: ipConfig.primary,
            publicIPAddress: ipConfig.publicIPAddress,
            subnet: ipConfig.subnet,
            loadBalancerBackendAddressPools: ipConfig.loadBalancerBackendAddressPools
        };
    }

    /**
    * Update Nics
    *
    * @param {String} group     - group
    * @param {String} nicName   - nicName
    * @param {String} nicParams - nicParams
    * @param {String} action    - action
    *
    * @returns {Promise}
    */
    _updateNics(group, nicName, nicParams, action) {
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
    * Update associations
    *
    * @param {Array} disassociate - Disassociate array
    * @param {Array} associate    - Associate array
    *
    * @returns {Promise}
    */
    _updateAssociations(disassociate, associate) {
        this.logger.debug('disassociate: ', disassociate);
        this.logger.debug('associate: ', associate);

        if (!disassociate || !associate) {
            this.logger.debug('No associations to update.');
            return Promise.resolve();
        }
        const disassociatePromises = [];
        disassociate.forEach((item) => {
            disassociatePromises.push(util.retrier.call(this, this._updateNics, item, shortRetry));
        });
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.info('Disassociate NICs successful.');

                const associatePromises = [];
                associate.forEach((item) => {
                    associatePromises.push(util.retrier.call(this, this._updateNics, item, shortRetry));
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
                if (tags) {
                    // filter route tables based on tag(s)
                    routeTables = routeTables.filter((item) => {
                        let matchedTags = 0;
                        const tagKeys = Object.keys(tags);
                        tagKeys.forEach((key) => {
                            if (Object.keys(item.tags).indexOf(key) !== -1 && item.tags[key] === tags[key]) {
                                matchedTags += 1;
                            }
                        });
                        return tagKeys.length === matchedTags;
                    });
                }
                return Promise.resolve(routeTables);
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
