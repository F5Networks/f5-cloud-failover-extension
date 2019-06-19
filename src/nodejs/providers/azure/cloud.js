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
const cloudUtil = require('@f5devcentral/f5-cloud-libs').util;
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
     */
    init() {
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
            });
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
        this.logger.debug(localAddresses);
        this.logger.debug(failoverAddresses);

        return this._listNics({ tags: this.tags || null })
            .then((nics) => {
                nics.forEach((nic) => {
                    this.logger.debug(nic.name, nic.tags);
                });
            });
    }

    _getAzureEnvironment(metadata) {
        const specialLocations = {
            AzurePublicCloud: 'Azure',
            AzureUSGovernmentCloud: 'AzureUSGovernment',
            AzureChinaCloud: 'AzureChina',
            AzureGermanCloud: 'AzureGermanCloud'
        };
        return azureEnvironment[specialLocations[metadata.compute.azEnvironment]];
    }

    _getInstanceMetadata() {
        return new Promise((resolve, reject) => {
            cloudUtil.getDataFromUrl(
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
    * @param {Object} options - Name of the resource group
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
                // TODO: implement filter based on tags here
                // - for now resource group scope is enough for testing
                if (tags) {
                    return Promise.resolve(nics);
                }
                return Promise.resolve(nics);
            });
    }
}

module.exports = {
    Cloud
};
