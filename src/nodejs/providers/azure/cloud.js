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
    }

    /**
     * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
     */
    init() {
        return this._getInstanceMetadata()
            .then((metadata) => {
                const subscriptionId = metadata.compute.subscriptionId;
                const environment = this._getAzureEnvironment(metadata);

                const msiOptions = {
                    resource: environment.resourceManagerEndpointUrl,
                    msiApiVersion: '2018-02-01'
                };
                const credentials = new msRestAzure.MSIVmTokenCredentials(msiOptions);

                this.networkClient = new NetworkManagementClient(
                    credentials,
                    subscriptionId,
                    environment.resourceManagerEndpointUrl
                );
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
                'http://168.63.129.16/metadata/instance?api-version=2018-10-01',
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
}

module.exports = {
    Cloud
};
