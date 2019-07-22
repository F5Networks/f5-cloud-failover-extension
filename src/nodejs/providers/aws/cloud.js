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

const AWS = require('aws-sdk');
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);
    }

    /**
    * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
    *
    * @param {Object} options       - function options
    * @param {Array} [options.tags] - array containing tags to filter on [{'key': 'myKey', 'value': 'myValue' }]
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || null;

        return this._getInstanceIdentityDoc()
            .then((metadata) => {
                this.region = metadata.region;
                AWS.config.update({ region: this.region });
                this.ec2 = new AWS.EC2();
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
        this.logger.info('got some addresses:');
        this.logger.info(`localAddresses: ${localAddresses}`); // 10.0.11.136
        this.logger.info(`failoverAddresses: ${failoverAddresses}`); // undef

        return this._getElasticIPs(this.tags)
            .then((eips) => {
                this.logger.info(eips);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Returns the Elastic IP address(es) associated with this BIG-IP cluster
     *
     * @param   {Object}    tags    - Array containing tags to filter on [{'key': 'myKey', 'value': 'myValue' }]
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of Elastic IP(s), or
     *                          rejected if an error occurs
     */
    _getElasticIPs(tags) {
        const params = {
            Filters: []
        };
        tags.forEach((tag) => {
            params.Filters.push(
                {
                    Name: `tag:${tag.key}`,
                    Values: [
                        tag.value
                    ]
                }
            );
        });
        return new Promise((resolve, reject) => {
            this.ec2.describeAddresses(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Gets instance identity document
     *
     * @returns {Promise}   - A Promise that will be resolved with the Instance Identity document or
     *                          rejected if an error occurs
     */
    _getInstanceIdentityDoc() {
        return new Promise((resolve, reject) => {
            const metadata = new AWS.MetadataService();
            const iidPath = '/latest/dynamic/instance-identity/document';
            metadata.request(iidPath, (err, data) => {
                if (err) {
                    this.logger.error('Unable to retrieve Instance Identity');
                    reject(err);
                }
                resolve(
                    JSON.parse(data)
                );
            });
        });
    }
}

module.exports = {
    Cloud
};
