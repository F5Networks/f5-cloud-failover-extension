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
const util = require('../../util');
const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);

        this.metadata = new AWS.MetadataService();
    }

    /**
    * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
    *
    * @param {Object} options        - function options
    * @param {Object} [options.tags]            - object containing tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeTags]       - object containing tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeAddresses]  - object containing addresses to filter on [ '192.0.2.0/24' ]
    * @param {String} [options.routeSelfIpsTag] - object containing self IP's tag to match against: 'F5_SELF_IPS'
    * @param {Object} [options.storageTags]     - object containing storage tags to filter on { 'key': 'value' }
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || null;
        this.storageTags = options.storageTags || null;

        return this._getInstanceIdentityDoc()
            .then((metadata) => {
                this.region = metadata.region;
                this.instanceId = metadata.instanceId;

                AWS.config.update({ region: this.region });
                this.ec2 = new AWS.EC2();
                this.s3 = new AWS.S3();

                return this._getS3BucketByTags(this.storageTags);
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Updates the Public IP Addresses on the BIG-IP Cluster, by re-associating AWS Elastic IP Addresses
    *
    * @returns {Promise} - Resolves or rejects with the status of re-associating the Elastic IP Address(es)
    */
    updateAddresses() {
        return Promise.all([
            this._getElasticIPs(this.tags),
            this._getPrivateSecondaryIPs()
        ]).then((results) => {
            const eips = results[0].Addresses;
            const secondaryPrivateIps = results[1];

            return this._generateEIPConfigs(eips, secondaryPrivateIps);
        }).then((results) => {
            this.logger.info('Reassociating Elastic IP addresses');
            return this._reassociateEIPs(results);
        }).catch(err => Promise.reject(err));
    }

    // stub
    uploadDataToStorage() {
        return Promise.resolve();
    }

    // stub
    downloadDataFromStorage() {
        return Promise.resolve({});
    }

    /**
     * Re-associates the Elastic IP Addresses. Will first attempt to disassociate and then associate
     * the Elastic IP Address(es) to the newly active BIG-IP
     *
     * @param {Object} EIPConfigs - EIP Configuration we should set
     *
     * @returns {Promise} - Resolves or rejects with status of moving the EIP
     */
    _reassociateEIPs(EIPConfigs) {
        const disassociatePromises = [];
        const associatePromises = [];

        Object.keys(EIPConfigs).forEach((eipKeys) => {
            const AssociationId = EIPConfigs[eipKeys].current.AssociationId;
            // Disassociate EIP only if it is currently associated
            if (AssociationId) {
                disassociatePromises.push(util.retrier.call(this, this._disassociateIpAddress, [AssociationId]));
            }
        });
        // Disassociate EIP, in case EIP wasn't created with ability to reassociate when already associated
        return Promise.all(disassociatePromises)
            .then(() => {
                if (disassociatePromises.length === 0) {
                    this.logger.info('Disassociation of Elastic IP addresses not required');
                } else {
                    this.logger.info('Disassociation of Elastic IP addresses successful');
                }

                Object.keys(EIPConfigs).forEach((eipKeys) => {
                    const allocationId = EIPConfigs[eipKeys].AllocationId;
                    const networkInterfaceId = EIPConfigs[eipKeys].target.NetworkInterfaceId;
                    const privateIpAddress = EIPConfigs[eipKeys].target.PrivateIpAddress;

                    // Associate EIP only if all variables are present
                    if (allocationId && networkInterfaceId && privateIpAddress) {
                        associatePromises.push(
                            util.retrier.call(this, this._associateIpAddress,
                                [allocationId, networkInterfaceId, privateIpAddress])
                        );
                    }
                });
                return Promise.all(associatePromises);
            })
            .then(() => {
                if (associatePromises.length === 0) {
                    this.logger.info('Association of Elastic IP addresses not required');
                } else {
                    this.logger.info('Association of Elastic IP addresses successful');
                }
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Disassociate the Elastic IP address
     *
     * @param {String} associationIdToDisassociate  - Elastic IP associate to disassociate
     *
     * @returns {Promise} - A promise resolved or rejected based on the status of disassociating the Elastic IP Address
     */
    _disassociateIpAddress(associationIdToDisassociate) {
        return new Promise((resolve, reject) => {
            this.logger.debug(`disassociating: ${associationIdToDisassociate}`);
            const params = {
                AssociationId: associationIdToDisassociate
            };

            this.ec2.disassociateAddress(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Associate the Elastic IP address to a PrivateIP address on a given NIC
     * @param {String} allocationId         - Elastic IP allocation ID
     * @param {String} networkInterfaceId   - ID of NIC with the Private IP address
     * @param {String} privateIpAddress     - Private IP Address on the NIC to attach the Elastic IP address to
     *
     * @returns {Promise} - A Promise rejected or resolved based on the status of associating the Elastic IP address
     */
    _associateIpAddress(allocationId, networkInterfaceId, privateIpAddress) {
        return new Promise((resolve, reject) => {
            this.logger.debug(`associating: ${allocationId} to ${privateIpAddress}`);
            const params = {
                AllocationId: allocationId,
                NetworkInterfaceId: networkInterfaceId,
                PrivateIpAddress: privateIpAddress,
                AllowReassociation: true
            };
            this.ec2.associateAddress(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Generate the Elastic IP configuration data required to reassociate the Elastic IP addresses
     *
     * @param {Object} eips                 - Array of Elastic IP information, as returned from AWS.
     * @param {Object} privateInstanceIPs   - Collection of Secondary Private IP addresses, and their associated NIC ID
     *
     * @returns {Promise} - A Promise that is resolved with the Elastic IP configuration, or rejected if an error occurs
     */
    _generateEIPConfigs(eips, privateInstanceIPs) {
        const updatedState = {};
        // TODO: 'VIPS' should be a constant. Question: Should it be defined in the POST payload?
        const vipTagKey = 'VIPS';
        eips.forEach((eip) => {
            const targetAddresses = eip.Tags.find(tag => tag.Key === vipTagKey).Value.split(',');
            targetAddresses.forEach((targetAddress) => {
                // Check if the target address is present on local BIG-IP, and if the EIP isn't already associated
                if (targetAddress in privateInstanceIPs && targetAddress !== eip.PrivateIpAddress) {
                    this.logger.info(
                        `Moving Elastic IP: ${eip.PublicIp} to Private IP: ${targetAddress}, and off of ${eip.PrivateIpAddress}`
                    );

                    updatedState[eip.PublicIp] = {
                        target: {
                            PrivateIpAddress: targetAddress,
                            NetworkInterfaceId: privateInstanceIPs[targetAddress].NetworkInterfaceId
                        },
                        current: {
                            PrivateIpAddress: eip.PrivateIpAddress,
                            AssociationId: eip.AssociationId
                        },
                        AllocationId: eip.AllocationId
                    };
                }
            });
        });
        return updatedState;
    }

    /**
     * Get all Private Secondary IP addresses for this BIG-IP, and their associated NIC ID
     *
     * @returns {Promise}   - A Promise that will be resolved with all of the Private Secondary IP address, or
     *                          rejected if an error occurs. Example response:
     *
     *                          {
     *                              "10.0.11.139":
     *                              {
     *                                  "NetworkInterfaceId":"eni-034a05fef728d501b"
     *                              },
     *                              "10.0.11.82":
     *                              {
     *                                  "NetworkInterfaceId":"eni-034a05fef728d501b"
     *                              }
     *                          }
     */
    _getPrivateSecondaryIPs() {
        const params = {
            Filters: [
                {
                    Name: 'attachment.instance-id',
                    Values: [this.instanceId]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            this.ec2.describeNetworkInterfaces(params).promise()
                .then((data) => {
                    const privateIps = {};
                    data.NetworkInterfaces.forEach((nic) => {
                        nic.PrivateIpAddresses.forEach((privateIp) => {
                            if (privateIp.Primary === false) {
                                privateIps[privateIp.PrivateIpAddress] = {
                                    NetworkInterfaceId: nic.NetworkInterfaceId
                                };
                            }
                        });
                    });
                    resolve(privateIps);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Returns the Elastic IP address(es) associated with this BIG-IP cluster
     *
     * @param   {Object}    tags - object containing tags to filter on { 'key': 'value' }
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of Elastic IP(s), or
     *                          rejected if an error occurs
     */
    _getElasticIPs(tags) {
        const params = {
            Filters: []
        };

        const tagKeys = Object.keys(tags);
        tagKeys.forEach((tagKey) => {
            params.Filters.push(
                {
                    Name: `tag:${tagKey}`,
                    Values: [
                        tags[tagKey]
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
            const iidPath = '/latest/dynamic/instance-identity/document';
            this.metadata.request(iidPath, (err, data) => {
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

    /**
     * Gets the S3 bucket to use, from the provided storage tags
     *
     * @param   {Object}    tags - object containing tags to filter on { 'key': 'value' }
     *
     * @returns {Promise}   - A Promise that will be resolved with the S3 bucket name or
     *                          rejected if an error occurs
     */
    _getS3BucketByTags(tags) {
        const getBucketTagsPromises = [];

        return this._getAllS3Buckets()
            .then((data) => {
                data.forEach((bucket) => {
                    const getTagsArgs = [bucket, { rejectOnError: false }];
                    getBucketTagsPromises.push(util.retrier.call(this, this._getTags, getTagsArgs));
                });
                return Promise.all(getBucketTagsPromises);
            })
            // Filter out any 'undefined' responses
            .then(data => Promise.resolve(data.filter(i => i)))
            .then((taggedBuckets) => {
                const tagKeys = Object.keys(tags);
                const filteredBuckets = taggedBuckets.filter((taggedBucket) => {
                    let matchedTags = 0;
                    const bucketDict = taggedBucket.reduce((acc, cur) => {
                        acc[cur.Key] = cur.Value;
                        return acc;
                    }, {});
                    tagKeys.forEach((tagKey) => {
                        if (Object.keys(bucketDict).indexOf(tagKey) !== -1 && bucketDict[tagKey] === tags[tagKey]) {
                            matchedTags += 1;
                        }
                    });
                    return tagKeys.length === matchedTags;
                });
                this.logger.info('Filtered Buckets:');
                return Promise.resolve(filteredBuckets);
            })
            .then((filteredBuckets) => {
                if (!filteredBuckets.length) {
                    return Promise.reject(new Error('No valid S3 Buckets found!'));
                }
                this.s3BucketName = filteredBuckets[0]; // grab the first bucket for now
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Get all S3 buckets in account, to filter on later
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of every S3 bucket name or
     *                          rejected if an error occurs
     */
    _getAllS3Buckets() {
        const listAllBuckets = () => new Promise((resolve, reject) => {
            this.s3.listBuckets({}).promise()
                .then((data) => {
                    const bucketNames = data.Buckets.map(b => b.Name);
                    resolve(bucketNames);
                })
                .catch(err => reject(err));
        });
        return util.retrier.call(this, listAllBuckets);
    }

    /**
     * Get the Tags of a given S3 bucket, optionally rejecting or resolving on errors
     *
     * @param   {String}    bucket                  - name of the S3 bucket
     * @param   {Object}    options                 - function options
     * @param   {Boolean}   [options.rejectOnError] - whether or not to reject on error. Default: reject on error
     *
     * @returns {Promise}   - A Promise that will be resolved with the S3 bucket name or
     *                          rejected if an error occurs
     */
    _getTags(bucket, options) {
        const rejectOnError = options.rejectOnError || true;
        const params = {
            Bucket: bucket
        };
        return new Promise((resolve, reject) => {
            this.s3.getBucketTagging(params).promise()
                .then((data) => {
                    resolve({
                        Bucket: params.Bucket,
                        TagSet: data.TagSet
                    });
                })
                .catch((err) => {
                    if (rejectOnError) {
                        reject(err);
                    }
                    resolve(); // resolving since ignoring permissions errors to extraneous buckets
                });
        });
    }
}

module.exports = {
    Cloud
};
