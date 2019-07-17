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
const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AZURE, options);

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

        return this._getInstanceMetadata()
            .then((metadata) => {
                this.resourceGroup = metadata.compute.resourceGroupName;
                this.subscriptionId = metadata.compute.subscriptionId;

                const environment = this._getAzureEnvironment(metadata);
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
    * Lists all network interface configurations in this resource group
    *
    * @param {Object} options       - function options
    * @param {Array} [options.tags] - array containing tags to filter on [ { 'key': 'value' }]
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
                    const filteredNics = nics.filter((nic) => {
                        let matchedTags = 0;
                        tags.forEach((tag) => {
                            if (Object.keys(nic.tags).indexOf(tag.key) !== -1 && nic.tags[tag.key] === tag.value) {
                                matchedTags += 1;
                            }
                        });
                        return tags.length === matchedTags;
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
    * Retrier
    *
    * @param {Object} func - Function to try
    * @param {Object} args - args
    *
    * @returns {Promise}
    */
    _retrier(func, args) {
        return new Promise((resolve, reject) => {
            cloudLibsUtil.tryUntil(this, { maxRetries: 4, retryIntervalMs: 15000 }, func, args)
                .then(() => {
                    resolve();
                })
                .catch((error) => {
                    reject(error);
                });
        });
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
                this.logger.info(action, 'NIC: ', nicName);

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
            disassociatePromises.push(this._retrier(this._updateNics, item));
        });
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.info('Disassociate NICs successful.');

                const associatePromises = [];
                associate.forEach((item) => {
                    associatePromises.push(this._retrier(this._updateNics, item));
                });
                return Promise.all(associatePromises);
            })
            .then(() => {
                this.logger.info('Associate NICs successful.');
            })
            .catch(err => Promise.reject(err));
    }
}

module.exports = {
    Cloud
};
